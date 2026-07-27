import { createHash, randomUUID } from "node:crypto";
import { AiApiError, toSafeAiApiError, type AiApiErrorBody } from "@/lib/ai-api/errors";

export type AiRouteName =
  | "training-focus"
  | "daily-coach"
  | "inbody-coach"
  | "meal-coach";

interface AiPrincipal {
  kind: "user" | "guest";
  subject: string;
}

interface RateLimitResult {
  remaining: number;
  resetAt: number;
}

interface AiRouteOptions<T> {
  route: AiRouteName;
  maxBytes: number;
  parse: (value: unknown) => T;
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function commonHeaders(requestId: string) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId
  };
}

function jsonResponse(
  body: unknown,
  {
    status = 200,
    requestId,
    extraHeaders
  }: { status?: number; requestId: string; extraHeaders?: HeadersInit }
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...commonHeaders(requestId),
      ...Object.fromEntries(new Headers(extraHeaders).entries())
    }
  });
}

function clientIp(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowedOrigins = new Set<string>();
  try {
    const requestUrl = new URL(request.url);
    allowedOrigins.add(requestUrl.origin);
    const forwardedHost =
      request.headers.get("x-forwarded-host")
      ?? request.headers.get("host");
    const forwardedProtocol =
      request.headers.get("x-forwarded-proto")
      ?? requestUrl.protocol.replace(":", "");
    if (
      forwardedHost
      && /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost)
      && /^(https?|wss?)$/i.test(forwardedProtocol)
    ) {
      allowedOrigins.add(`${forwardedProtocol.toLowerCase()}://${forwardedHost}`);
    }
  } catch {
    return false;
  }
  return allowedOrigins.has(origin);
}

async function authenticate(request: Request, ipHash: string): Promise<AiPrincipal> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    if (process.env.AI_GUEST_ACCESS_ENABLED !== "true") {
      throw new AiApiError(
        "UNAUTHORIZED",
        401,
        "로그인한 사용자만 AI 기능을 사용할 수 있습니다."
      );
    }
    return { kind: "guest", subject: `guest:${ipHash}` };
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token || token.length > 4096) {
    throw new AiApiError("UNAUTHORIZED", 401, "유효한 인증 토큰이 필요합니다.");
  }

  const supabaseUrl =
    process.env.SUPABASE_URL
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new AiApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "AI 인증 서비스를 사용할 수 없습니다."
    );
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
  } catch {
    throw new AiApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "AI 인증 서비스를 사용할 수 없습니다."
    );
  }

  if (!response.ok) {
    throw new AiApiError("UNAUTHORIZED", 401, "로그인 세션이 만료되었거나 유효하지 않습니다.");
  }

  const user = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!user || typeof user.id !== "string" || user.id.length > 128) {
    throw new AiApiError("UNAUTHORIZED", 401, "로그인 사용자를 확인하지 못했습니다.");
  }
  return { kind: "user", subject: `user:${user.id}` };
}

function consumeMemoryBucket(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowSeconds * 1000 };
  bucket.count += 1;
  memoryBuckets.set(key, bucket);

  if (memoryBuckets.size > 5000) {
    for (const [bucketKey, value] of memoryBuckets) {
      if (value.resetAt <= now) memoryBuckets.delete(bucketKey);
      if (memoryBuckets.size <= 4000) break;
    }
  }

  if (bucket.count > limit) {
    throw new AiApiError("RATE_LIMITED", 429, "AI 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.");
  }
  return { remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

async function consumeSupabaseBucket(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const supabaseUrl =
    process.env.SUPABASE_URL
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const salt = process.env.AI_RATE_LIMIT_SALT;
  if (!supabaseUrl || !serviceRoleKey || !salt || salt.length < 16) {
    throw new AiApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "AI 요청 보호 설정이 완료되지 않았습니다."
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/consume_ai_rate_limit`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_key_hash: stableHash(`${salt}:${key}`),
          p_limit: limit,
          p_window_seconds: windowSeconds
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000)
      }
    );
  } catch {
    throw new AiApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "AI 요청 보호 서비스를 사용할 수 없습니다."
    );
  }

  if (!response.ok) {
    throw new AiApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "AI 요청 보호 서비스를 사용할 수 없습니다."
    );
  }

  const payload = await response.json().catch(() => null) as
    | Array<{ allowed?: unknown; remaining?: unknown; reset_at?: unknown }>
    | null;
  const result = payload?.[0];
  if (
    !result
    || typeof result.allowed !== "boolean"
    || typeof result.remaining !== "number"
    || typeof result.reset_at !== "string"
  ) {
    throw new AiApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "AI 요청 보호 서비스 응답이 올바르지 않습니다."
    );
  }
  if (!result.allowed) {
    throw new AiApiError("RATE_LIMITED", 429, "AI 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.");
  }
  return {
    remaining: Math.max(0, Math.floor(result.remaining)),
    resetAt: new Date(result.reset_at).getTime()
  };
}

function durableRateLimitRequired() {
  return (
    process.env.AI_RATE_LIMIT_BACKEND === "supabase"
    || (
      process.env.VERCEL === "1"
      && process.env.AI_RATE_LIMIT_BACKEND !== "memory"
    )
  );
}

async function enforceIpRateLimit(
  ipHash: string
): Promise<RateLimitResult> {
  const limit = 100;
  const windowSeconds = 60 * 60;
  const key = `ai:ip:${ipHash}`;
  return durableRateLimitRequired()
    ? consumeSupabaseBucket(key, limit, windowSeconds)
    : consumeMemoryBucket(key, limit, windowSeconds);
}

async function enforcePrincipalRateLimit(
  principal: AiPrincipal
): Promise<RateLimitResult> {
  const isGuest = principal.kind === "guest";
  const principalLimit = isGuest ? 6 : 60;
  const windowSeconds = 60 * 60;
  const subjectKey = `ai:subject:${principal.subject}`;
  return durableRateLimitRequired()
    ? consumeSupabaseBucket(
        subjectKey,
        principalLimit,
        windowSeconds
      )
    : consumeMemoryBucket(subjectKey, principalLimit, windowSeconds);
}

export async function readLimitedJson(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new AiApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      415,
      "Content-Type은 application/json이어야 합니다."
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0) {
      throw new AiApiError("BAD_REQUEST", 400, "Content-Length가 올바르지 않습니다.");
    }
    if (declared > maxBytes) {
      throw new AiApiError("PAYLOAD_TOO_LARGE", 413, "AI 요청 본문이 너무 큽니다.");
    }
  }

  if (!request.body) {
    throw new AiApiError("BAD_REQUEST", 400, "JSON 요청 본문이 필요합니다.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AiApiError("PAYLOAD_TOO_LARGE", 413, "AI 요청 본문이 너무 큽니다.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiApiError("INVALID_JSON", 400, "올바른 JSON 요청 본문이 필요합니다.");
  }
}

export async function handleAiPost<T>(
  request: Request,
  options: AiRouteOptions<T>,
  handler: (body: T, metadata: { requestId: string; principalKind: AiPrincipal["kind"] }) => Promise<unknown>
) {
  const requestId = randomUUID();
  try {
    if (!requestOriginAllowed(request)) {
      throw new AiApiError("FORBIDDEN_ORIGIN", 403, "허용되지 않은 요청 출처입니다.");
    }
    const ipHash = stableHash(clientIp(request));
    const ipRateLimit = await enforceIpRateLimit(ipHash);
    const principal = await authenticate(request, ipHash);
    const principalRateLimit = await enforcePrincipalRateLimit(
      principal
    );
    const rateLimit = {
      remaining: Math.min(ipRateLimit.remaining, principalRateLimit.remaining),
      resetAt: Math.min(ipRateLimit.resetAt, principalRateLimit.resetAt)
    };
    const rawBody = await readLimitedJson(request, options.maxBytes);
    const body = options.parse(rawBody);
    const result = await handler(body, {
      requestId,
      principalKind: principal.kind
    });
    return jsonResponse(result, {
      requestId,
      extraHeaders: {
        "RateLimit-Limit": String(principal.kind === "guest" ? 6 : 60),
        "RateLimit-Remaining": String(rateLimit.remaining),
        "RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000))
      }
    });
  } catch (error) {
    const safeError = toSafeAiApiError(error);
    if (safeError.status >= 500) {
      console.warn("[ai-api] request failed", {
        requestId,
        route: options.route,
        code: safeError.code
      });
    }
    const body: AiApiErrorBody = {
      error: {
        code: safeError.code,
        message: safeError.message,
        requestId
      }
    };
    return jsonResponse(body, {
      status: safeError.status,
      requestId,
      extraHeaders:
        safeError.status === 429
          ? { "Retry-After": "3600" }
          : undefined
    });
  }
}

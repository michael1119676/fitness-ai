export type AiApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UNAUTHORIZED"
  | "FORBIDDEN_ORIGIN"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AiApiError extends Error {
  readonly code: AiApiErrorCode;
  readonly status: number;

  constructor(code: AiApiErrorCode, status: number, message: string) {
    super(message);
    this.name = "AiApiError";
    this.code = code;
    this.status = status;
  }
}

export interface AiApiErrorBody {
  error: {
    code: AiApiErrorCode;
    message: string;
    requestId: string;
  };
}

export function toSafeAiApiError(error: unknown) {
  if (error instanceof AiApiError) return error;
  return new AiApiError(
    "INTERNAL_ERROR",
    500,
    "AI 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요."
  );
}

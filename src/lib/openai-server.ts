import OpenAI from "openai";
import type { DailyTrainingContext, DailyTrainingDecision } from "@/lib/daily-types";
import { minimizeTrainingContextForAi } from "@/lib/ai-api/minimize";
import { validateCoachResult } from "@/lib/ai-api/request-schema";
import { dailyTrainingDecisionJsonSchema } from "@/lib/daily-planning/decision-schema";
import {
  generateFallbackTrainingDecision,
  validateDailyTrainingDecision
} from "@/lib/daily-planning";

const timeoutMs = 12000;
const defaultOpenAiModel = "gpt-5.5";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getModel() {
  return process.env.OPENAI_MODEL?.trim() || defaultOpenAiModel;
}

async function withTimeout<T>(promise: Promise<T>, ms = timeoutMs) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("OpenAI request timed out")), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export async function getTrainingFocusDecision(context: DailyTrainingContext) {
  const fallback = generateFallbackTrainingDecision(context);
  const client = getClient();
  const model = getModel();

  if (!client) {
    return {
      decision: fallback,
      source: "fallback" as const,
      message: "OPENAI_API_KEY가 없어 로컬 fallback 플래너를 사용했습니다."
    };
  }

  try {
    const response = await withTimeout(
      client.responses.create({
        model,
        instructions: [
          "You are the AI Training Focus Planner for a Korean Adaptive Daily Fitness Coach.",
          "Use only the provided JSON. Do not infer unavailable facts or invent records.",
          "Return Korean reasoning and JSON only through the provided schema.",
          "Choose session mode, body-part focus, selected/excluded muscles, and movement slots only.",
          "Do not choose concrete exercise names or equipment names. The equipment-aware engine will do that.",
          "forbiddenMuscles and painMuscles are absolute hard constraints. Never select them or related target regions.",
          "forbiddenMovementFamilies are absolute hard constraints.",
          "Never select a movementFamily that is absent from availableMovementCapabilities.",
          "movementSlots.primaryMuscle and targetRegion must stay inside selectedMuscles or a clearly related accessory range.",
          "Do not add antagonist or unrelated body parts just to satisfy exercise count.",
          "For chest/triceps/front_delt sessions, never add biceps, rear_delt, side_delt, lats, upper_back, mid_back, or lower_back slots.",
          "For back/lats/rear_delt/biceps sessions, never add chest, triceps, or front_delt slots.",
          "If availableTimeMinutes is tight, reduce slot count instead of adding unrelated muscles.",
          "Respect equipmentMode, availableTimeMinutes, recoveryScore, weekly volume deficits, bodyGoalProfile, nutritionStatus, and inBodyTrend.",
          "Do not overreact to a single InBody record; if confidence is low, say insufficient_data.",
          "Do not force priority muscles when recovery is poor, soreness is high, or pain is present.",
          "Do not name the result Push Day, Pull Day, Legs, Upper, Lower, or Full Body.",
          "Use body-part titles such as 광배·등 상부·측면어깨 집중.",
          "If constraints leave no safe session, choose rest_recommended.",
          "Set fallbackUsed to false."
        ].join("\n"),
        input: JSON.stringify(minimizeTrainingContextForAi(context)),
        max_output_tokens: 1400,
        text: {
          format: {
            type: "json_schema",
            name: "daily_training_decision",
            schema: dailyTrainingDecisionJsonSchema,
            strict: true
          }
        }
      })
    );
    const parsed = parseJson<DailyTrainingDecision>(response.output_text);
    const decision = validateDailyTrainingDecision(
      { ...parsed, fallbackUsed: false },
      context
    );

    return { decision, source: "openai" as const, message: "OpenAI 결정 결과를 적용했습니다." };
  } catch {
    console.warn("[openai] request failed", {
      operation: "training-focus",
      fallback: true
    });
    return {
      decision: {
        ...fallback,
        warnings: [
          ...fallback.warnings,
          "AI 결정을 사용할 수 없어 로컬 fallback 결과를 적용했습니다."
        ]
      },
      source: "fallback" as const,
      message: "AI 호출을 사용할 수 없어 로컬 fallback 플래너를 사용했습니다."
    };
  }
}

export async function getShortCoachJson({
  name,
  instructions,
  input,
  fallback
}: {
  name: string;
  instructions: string;
  input: unknown;
  fallback: { summary: string; actions: string[]; fallbackUsed: boolean };
}) {
  const client = getClient();
  const model = getModel();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "actions", "fallbackUsed"],
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 600 },
      actions: {
        type: "array",
        maxItems: 6,
        items: { type: "string", minLength: 1, maxLength: 300 }
      },
      fallbackUsed: { type: "boolean" }
    }
  } as const;

  if (!client) return fallback;

  try {
    const response = await withTimeout(
      client.responses.create({
        model,
        instructions,
        input: JSON.stringify(input),
        max_output_tokens: 500,
        text: {
          format: {
            type: "json_schema",
            name,
            schema,
            strict: true
          }
        }
      })
    );
    return validateCoachResult(parseJson<unknown>(response.output_text));
  } catch {
    console.warn("[openai] request failed", {
      operation: name,
      fallback: true
    });
    return fallback;
  }
}

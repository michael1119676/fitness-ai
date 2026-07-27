import { parseDailyCoachRequest } from "@/lib/ai-api/request-schema";
import { handleAiPost } from "@/lib/ai-api/security";
import { getShortCoachJson } from "@/lib/openai-server";

export async function POST(request: Request) {
  return handleAiPost(
    request,
    {
      route: "daily-coach",
      maxBytes: 48 * 1024,
      parse: parseDailyCoachRequest
    },
    (body) =>
      getShortCoachJson({
        name: "daily_coach_notes",
        instructions:
          "한국어로 오늘 운동/회복 결정을 짧게 설명하고 사용자가 바로 할 행동만 제안하세요.",
        input: body,
        fallback: {
          summary: "오늘 체크인과 기록을 기준으로 로컬 코치 메모를 만들었습니다.",
          actions: ["금지 부위는 그대로 제외하세요.", "운동 전 컨디션이 더 떨어지면 회복 세션으로 낮추세요."],
          fallbackUsed: true
        }
      })
  );
}

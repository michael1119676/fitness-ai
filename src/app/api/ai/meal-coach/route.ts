import { parseMealCoachRequest } from "@/lib/ai-api/request-schema";
import { handleAiPost } from "@/lib/ai-api/security";
import { getShortCoachJson } from "@/lib/openai-server";

export async function POST(request: Request) {
  return handleAiPost(
    request,
    {
      route: "meal-coach",
      maxBytes: 12 * 1024,
      parse: parseMealCoachRequest
    },
    (body) =>
      getShortCoachJson({
        name: "meal_coach_notes",
        instructions:
          "한국어로 남은 끼니의 칼로리/단백질/탄수화물/지방 균형을 짧고 실용적으로 조언하세요.",
        input: body,
        fallback: {
          summary: "현재 식사 로그 기준으로 남은 매크로를 균등 재분배했습니다.",
          actions: ["남은 끼니에서 단백질을 먼저 채우세요.", "지방 목표를 이미 넘겼다면 다음 끼니는 저지방으로 가세요."],
          fallbackUsed: true
        }
      })
  );
}

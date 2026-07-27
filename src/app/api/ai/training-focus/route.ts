import { parseTrainingFocusRequest } from "@/lib/ai-api/request-schema";
import { handleAiPost } from "@/lib/ai-api/security";
import { getTrainingFocusDecision } from "@/lib/openai-server";

export async function POST(request: Request) {
  return handleAiPost(
    request,
    {
      route: "training-focus",
      maxBytes: 48 * 1024,
      parse: parseTrainingFocusRequest
    },
    ({ context }) => getTrainingFocusDecision(context)
  );
}

import { aiChat } from "@/lib/ai/client";
import { assertAiFeaturesEnabled } from "@/lib/ai/config";
import { AI_PROMPTS } from "@/lib/ai/prompts";
import { logInfo } from "@/lib/logging/logger";

export async function suggestReviewReply(input: {
  reviewText: string;
  rating: number;
  clientName: string;
  serviceName: string;
}): Promise<string | null> {
  await assertAiFeaturesEnabled();

  const prompt = AI_PROMPTS.reviewReply;
  const result = await aiChat({
    scope: "review-reply",
    systemPrompt: prompt.system,
    userPrompt: prompt.buildUserPrompt(input),
    temperature: 0.7,
    maxTokens: 250,
  });

  if (result) {
    logInfo("Review reply suggestion generated", { rating: input.rating });
  }

  return result;
}

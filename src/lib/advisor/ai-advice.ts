import { aiChat } from "@/lib/ai/client";
import { assertAiFeaturesEnabled } from "@/lib/ai/config";
import { AI_PROMPTS } from "@/lib/ai/prompts";
import { logInfo } from "@/lib/logging/logger";
import type { MasterStats } from "@/lib/advisor/types";

export async function generateAdvisorAdvice(stats: MasterStats): Promise<string | null> {
  await assertAiFeaturesEnabled();

  const prompt = AI_PROMPTS.advisorAdvice;
  const result = await aiChat({
    scope: "advisor-advice",
    systemPrompt: prompt.system,
    userPrompt: prompt.buildUserPrompt(stats),
    temperature: 0.7,
    maxTokens: 300,
  });

  if (result) {
    logInfo("Advisor AI advice generated");
  }

  return result;
}

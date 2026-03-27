import { aiChat } from "@/lib/ai/client";
import { assertAiFeaturesEnabled } from "@/lib/ai/config";
import { AI_PROMPTS } from "@/lib/ai/prompts";
import { logInfo } from "@/lib/logging/logger";

export async function suggestServiceDescription(input: {
  name: string;
  category: string;
  price: number;
  durationMin: number;
}): Promise<string | null> {
  await assertAiFeaturesEnabled();

  const prompt = AI_PROMPTS.serviceDescription;
  const result = await aiChat({
    scope: "service-description",
    systemPrompt: prompt.system,
    userPrompt: prompt.buildUserPrompt(input),
    temperature: 0.7,
    maxTokens: 200,
  });

  if (result) {
    logInfo("Service description suggestion generated", { serviceName: input.name });
  }

  return result;
}

import { generateAdvisorAdvice } from "@/lib/advisor/ai-advice";
import { collectMasterStats } from "@/lib/advisor/collector";
import { ADVISOR_RULES } from "@/lib/advisor/rules";
import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { logError } from "@/lib/logging/logger";
import type { AdvisorInsight } from "@/lib/advisor/types";
import { UI_TEXT } from "@/lib/ui/text";

export async function computeAdvisorInsights(providerId: string): Promise<AdvisorInsight[]> {
  const stats = await collectMasterStats(providerId);
  const insights: AdvisorInsight[] = ADVISOR_RULES.filter((rule) => rule.check(stats)).map((rule) => ({
    id: rule.id,
    weight: rule.weight,
    title: rule.title,
    message: rule.message(stats),
    action: rule.action,
  }));

  const aiEnabled = await getAiFeaturesEnabled();
  if (aiEnabled) {
    try {
      const aiAdvice = await generateAdvisorAdvice(stats);
      if (aiAdvice) {
        insights.push({
          id: "ai_advice",
          weight: 50,
          title: UI_TEXT.master.advisor.aiInsightTitle,
          message: aiAdvice,
        });
      }
    } catch (error) {
      logError("Advisor AI advice generation failed", {
        providerId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  insights.sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title, "ru"));
  return insights.slice(0, 5);
}

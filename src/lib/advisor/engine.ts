import { generateAdvisorAdvice } from "@/lib/advisor/ai-advice";
import { collectMasterStats } from "@/lib/advisor/collector";
import { ADVISOR_RULES } from "@/lib/advisor/rules";
import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { logError, logInfo } from "@/lib/logging/logger";
import { AiSpendCeilingError } from "@/lib/ai/spend-ceiling";
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
      // FIX-B16: исчерпанный суточный потолок — ОЖИДАЕМОЕ состояние, а не сбой.
      // Панель советника собрана из правил, AI-совет в ней один из пяти, поэтому
      // деградация здесь правильная: пользователь получает работающий экран, а не
      // отказ. Но писать это в `logError` нельзя — тогда нормальный день выглядит
      // в трекере как поломка, и настоящий сбой генерации в этом шуме теряется.
      if (error instanceof AiSpendCeilingError) {
        logInfo("Advisor AI advice skipped — daily spend ceiling reached", {
          providerId,
          meter: error.meter,
        });
      } else {
        logError("Advisor AI advice generation failed", {
          providerId,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }

  insights.sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title, "ru"));
  return insights.slice(0, 5);
}

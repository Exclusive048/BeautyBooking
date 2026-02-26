import { collectMasterStats } from "@/lib/advisor/collector";
import { ADVISOR_RULES } from "@/lib/advisor/rules";
import type { AdvisorInsight } from "@/lib/advisor/types";

export async function computeAdvisorInsights(providerId: string): Promise<AdvisorInsight[]> {
  const stats = await collectMasterStats(providerId);
  const insights = ADVISOR_RULES.filter((rule) => rule.check(stats)).map((rule) => ({
    id: rule.id,
    weight: rule.weight,
    title: rule.title,
    message: rule.message(stats),
    action: rule.action,
  }));

  insights.sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title, "ru"));
  return insights.slice(0, 5);
}

import type { ReactNode } from "react";
import type { CabinetHomeInsights } from "@/lib/cabinet-insights/home";
import type { CabinetScope } from "@/lib/cabinet-insights/types";
import { AiAnalysisCard } from "./ai-analysis-card";
import { AnnouncementsSection } from "./announcements-section";
import { TipsSection } from "./tips-section";

type Props = {
  scope: CabinetScope;
  /** Быстрые действия кабинета — у мастера и студии свои. */
  quickActions: ReactNode;
  insights: CabinetHomeInsights;
  billingHref: string;
  /** Пояс кабинета (salon-tz) — дата ИИ-разбора. */
  timeZone: string;
};

/**
 * Нижняя часть главной кабинетов мастера и студии (AI-CABINET-ANALYSIS):
 * слева — что сделать (быстрые действия, ИИ-разбор), справа — что подсказать
 * (советы, новое в продукте). На телефоне — одной колонкой в том же порядке.
 */
export function CabinetHomeLower({ scope, quickActions, insights, billingHref, timeZone }: Props) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:gap-6 xl:grid-cols-2">
      <div className="space-y-4 md:space-y-6">
        {quickActions}
        {insights.ai ? (
          <AiAnalysisCard
            scope={scope}
            allowed={insights.ai.allowed}
            initialAnalysis={insights.ai.analysis}
            billingHref={billingHref}
            timeZone={timeZone}
          />
        ) : null}
      </div>
      <div className="space-y-4 md:space-y-6">
        <TipsSection tips={insights.tips} />
        <AnnouncementsSection items={insights.announcements} />
      </div>
    </div>
  );
}

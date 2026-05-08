import type { MasterAnalyticsPeriodId } from "@/lib/master/analytics-period";
import { UI_TEXT } from "@/lib/ui/text";
import { ComparisonToggle } from "./comparison-toggle";
import { ExportButtons } from "./export-buttons";
import { PeriodChips } from "./period-chips";

const T = UI_TEXT.cabinetMaster.analytics.period;

type Props = {
  activePeriod: MasterAnalyticsPeriodId;
  comparison: boolean;
  periodDisplay: string;
  customPeriodAvailable: boolean;
};

/**
 * Top-of-page toolbar: chips + comparison toggle on the left, period
 * display + export buttons on the right. RSC layout — only the chips +
 * toggle are client islands so URL state stays driven by Next routing.
 */
export function PeriodSelectorBar({
  activePeriod,
  comparison,
  periodDisplay,
  customPeriodAvailable,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
      <PeriodChips active={activePeriod} customAvailable={customPeriodAvailable} />
      <ComparisonToggle checked={comparison} />
      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.periodLabel}: {periodDisplay}
        </span>
        <ExportButtons />
      </div>
    </div>
  );
}

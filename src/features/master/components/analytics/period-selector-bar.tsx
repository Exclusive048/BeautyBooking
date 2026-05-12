import type { MasterAnalyticsPeriodId } from "@/lib/master/analytics-period";
import { UI_TEXT } from "@/lib/ui/text";
import { ComparisonToggle } from "./comparison-toggle";
import { PeriodChips } from "./period-chips";

const T = UI_TEXT.cabinetMaster.analytics.period;

type Props = {
  activePeriod: MasterAnalyticsPeriodId;
  comparison: boolean;
  periodDisplay: string;
  customPeriodAvailable: boolean;
  /** ISO date keys for the active range (used by the custom-period picker). */
  rangeFromKey: string;
  rangeToKey: string;
};

/**
 * Top-of-page toolbar: chips + comparison toggle on the left, period
 * display on the right.
 *
 * fix-02: Excel/PDF placeholder buttons removed. Real server-side
 * renderers will land in a dedicated ticket (BACKLOG).
 */
export function PeriodSelectorBar({
  activePeriod,
  comparison,
  periodDisplay,
  customPeriodAvailable,
  rangeFromKey,
  rangeToKey,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
      <PeriodChips
        active={activePeriod}
        customAvailable={customPeriodAvailable}
        rangeFromKey={rangeFromKey}
        rangeToKey={rangeToKey}
      />
      <ComparisonToggle checked={comparison} />
      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.periodLabel}: {periodDisplay}
        </span>
      </div>
    </div>
  );
}

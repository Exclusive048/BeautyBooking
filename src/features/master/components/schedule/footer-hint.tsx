import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule;

type Props = {
  fetchedAt: Date;
  /** EXP-019: master (salon) tz — the "updated at" time shown in the master's own tz. */
  timezone: string;
};

/**
 * Footer below the week grid. Left side: empty-cell-click hint; right
 * side: last-fetch timestamp (mono font, tabular nums) so the master can
 * tell at a glance whether the view is fresh.
 */
export function FooterHint({ fetchedAt, timezone }: Props) {
  const updatedLabel = T.footerUpdatedTemplate.replace("{time}", formatLocalHm(fetchedAt, timezone));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-sec">
      <span>{T.footerHintCreate}</span>
      <span className="font-mono tabular-nums">{updatedLabel}</span>
    </div>
  );
}

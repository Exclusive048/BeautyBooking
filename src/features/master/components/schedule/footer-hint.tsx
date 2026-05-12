import { formatHm } from "@/lib/master/schedule-utils";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule;

type Props = {
  fetchedAt: Date;
};

/**
 * Footer below the week grid. Left side: empty-cell-click hint; right
 * side: last-fetch timestamp (mono font, tabular nums) so the master can
 * tell at a glance whether the view is fresh.
 */
export function FooterHint({ fetchedAt }: Props) {
  const updatedLabel = T.footerUpdatedTemplate.replace("{time}", formatHm(fetchedAt));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-sec">
      <span>{T.footerHintCreate}</span>
      <span className="font-mono tabular-nums">{updatedLabel}</span>
    </div>
  );
}

import type { ScheduleTimeBlockItem } from "@/lib/master/schedule.service";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  block: ScheduleTimeBlockItem;
  topPx: number;
  heightPx: number;
};

const T = UI_TEXT.cabinetMaster.schedule;

/**
 * Striped placeholder for `TimeBlock` rows (BREAK / BLOCK). Diagonal
 * stripes hint that the slot isn't bookable; the label inside picks up
 * either the saved note or the default "Перерыв" / "Заблокировано" text.
 */
export function TimeBlockCard({ block, topPx, heightPx }: Props) {
  const label = block.note?.trim()
    ? block.note
    : block.type === "BREAK"
      ? T.timeBlockBreak
      : T.timeBlockBlocked;
  return (
    <div
      role="presentation"
      style={{
        position: "absolute",
        top: topPx,
        left: 4,
        right: 4,
        height: heightPx,
        backgroundImage:
          "repeating-linear-gradient(45deg, rgb(var(--bg-input)) 0 6px, transparent 6px 12px)",
      }}
      className="flex items-center justify-center rounded-lg border border-dashed border-border-subtle text-xs font-medium text-text-sec"
    >
      {label}
    </div>
  );
}

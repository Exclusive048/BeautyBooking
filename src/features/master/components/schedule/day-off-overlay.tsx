import { Moon } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import { dayOffLabelCenterPx, type MinuteSpan } from "./day-off-label";

type Props = {
  /** Записи и блокировки колонки — подпись не должна на них лечь. */
  occupied: MinuteSpan[];
  hourStart: number;
  hourEnd: number;
  hourPx: number;
};

/**
 * Soft overlay rendered inside a day column when the master isn't working
 * that day. Sits absolutely above the hour grid so booking cards (if a
 * one-off override sneaks in) still render on top.
 *
 * SCHEDULE-FLEX-DATE-NAV: подпись «Выходной» стоит в самом высоком свободном
 * участке колонки (`dayOffLabelCenterPx`), а не по центру — по центру она
 * просвечивала сквозь полупрозрачную карточку записи.
 */
export function DayOffOverlay({ occupied, hourStart, hourEnd, hourPx }: Props) {
  const centerPx = dayOffLabelCenterPx({ occupied, hourStart, hourEnd, hourPx });
  return (
    <div className="pointer-events-none absolute inset-0 bg-bg-page/40 backdrop-blur-[1px]">
      {centerPx !== null ? (
        <div className="absolute inset-x-0 -translate-y-1/2 text-center" style={{ top: centerPx }}>
          <Moon className="mx-auto mb-1 h-6 w-6 text-text-sec/50" aria-hidden />
          <p className="text-xs text-text-sec">{UI_TEXT.cabinetMaster.schedule.dayOff}</p>
        </div>
      ) : null}
    </div>
  );
}

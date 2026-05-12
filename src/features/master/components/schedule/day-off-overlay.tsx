import { Moon } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * Soft overlay rendered inside a day column when the master isn't working
 * that day. Sits absolutely above the hour grid so booking cards (if a
 * one-off override sneaks in) still render on top.
 */
export function DayOffOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-page/40 backdrop-blur-[1px]">
      <div className="text-center">
        <Moon className="mx-auto mb-1 h-6 w-6 text-text-sec/50" aria-hidden />
        <p className="text-xs text-text-sec">{UI_TEXT.cabinetMaster.schedule.dayOff}</p>
      </div>
    </div>
  );
}

import {
  GRID_HEIGHT_PX,
  SLOT_HEIGHT_PX,
  formatTime,
  iterateSlotMinutes,
} from "../../lib/time-grid";

export function TimeAxis() {
  const slots = Array.from(iterateSlotMinutes());
  return (
    <div
      className="relative w-14 shrink-0 border-r border-border-subtle bg-bg-card"
      style={{ height: GRID_HEIGHT_PX }}
      aria-hidden
    >
      {slots.map((minutes, index) => (
        <div
          key={minutes}
          className="absolute right-0 -translate-y-1/2 pr-2 font-mono text-[10px] uppercase tracking-wide text-text-sec"
          style={{ top: index * SLOT_HEIGHT_PX }}
        >
          {minutes % 60 === 0 ? formatTime(minutes) : ""}
        </div>
      ))}
    </div>
  );
}

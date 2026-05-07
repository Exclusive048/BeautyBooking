type Props = {
  hourStart: number;
  hourEnd: number;
  hourPx: number;
};

/**
 * Left rail of the week grid — one HH:mm label per hour aligned with the
 * grid's hour boundaries. Mono font + tabular nums so the axis stays
 * pixel-stable when hours roll over from single- to double-digit.
 */
export function TimeAxis({ hourStart, hourEnd, hourPx }: Props) {
  const hours: number[] = [];
  for (let h = hourStart; h < hourEnd; h++) hours.push(h);

  return (
    <div className="border-r border-border-subtle">
      {hours.map((h) => (
        <div
          key={h}
          style={{ height: hourPx }}
          className="px-2 pt-1 text-right font-mono text-[10px] tabular-nums text-text-sec"
        >
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

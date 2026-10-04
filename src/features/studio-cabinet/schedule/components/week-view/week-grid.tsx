import Link from "next/link";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleWeekData, ScheduleWeekRow } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.weekView;

type WeekCell = ScheduleWeekRow["cells"][number];

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return T.durationMinutes.replace("{m}", String(m));
  if (m === 0) return T.durationHours.replace("{h}", String(h));
  return T.durationHoursMinutes.replace("{h}", String(h)).replace("{m}", String(m));
}

/** MOBILE-POLISH: подсказка ячейки — записи и занятое время из рабочего по графику. */
function occupancyTitle(cell: WeekCell): string {
  if (cell.fixedSlots !== null) {
    return T.occupancyTitleSlots.replace("{booked}", String(cell.booked)).replace("{slots}", String(cell.fixedSlots));
  }
  return T.occupancyTitleMinutes
    .replace("{booked}", String(cell.booked))
    .replace("{bookedTime}", durationLabel(cell.bookedMinutes))
    .replace("{capacityTime}", durationLabel(cell.capacityMinutes ?? 0));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

export function WeekGrid({ week }: { week: ScheduleWeekData }) {
  if (week.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-8 text-center text-sm text-text-sec">
        {T.empty}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-bg-input/40">
            <tr>
              <th className="sticky left-0 z-10 min-w-[200px] bg-bg-input/40 px-3 py-2 text-left eyebrow">
                {T.masterColumn}
              </th>
              {week.days.map((day) => (
                <th
                  key={day.dateKey}
                  className={cn(
                    "px-3 py-2 text-center eyebrow",
                    day.isToday ? "text-accent-text" : "text-text-sec",
                  )}
                >
                  {day.weekdayLabel} {day.dayNumber}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.rows.map((row) => (
              <tr key={row.master.id} className="border-t border-border-subtle">
                <td className="sticky left-0 z-10 min-w-[200px] bg-bg-card px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {row.master.avatarUrl ? (
                      <ResilientImage
                        src={row.master.avatarUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec ring-1 ring-border-subtle"
                      >
                        {initials(row.master.name)}
                      </span>
                    )}
                    <span className="truncate text-sm font-semibold text-text-main">
                      {row.master.name}
                    </span>
                  </div>
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.dateKey} className="px-2 py-2.5 text-center">
                    {cell.isDayOff ? (
                      <abbr title={T.dayOffFull} className="font-mono text-2xs text-text-sec/60 decoration-transparent">
                        {T.dayOff}
                      </abbr>
                    ) : (
                      <Link
                        href={`?view=day&date=${cell.dateKey}`}
                        scroll={false}
                        title={occupancyTitle(cell)}
                        className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/5"
                      >
                        <p className="font-mono text-xs font-semibold tabular-nums text-text-main">
                          {T.occupancyPercent.replace("{percent}", String(cell.percent))}
                        </p>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-input">
                          <div
                            className="h-full rounded-full bg-brand-gradient"
                            style={{ width: `${cell.percent}%` }}
                          />
                        </div>
                      </Link>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

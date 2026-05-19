import Link from "next/link";
import { FocalImage } from "@/components/ui/focal-image";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleWeekData } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.weekView;

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
              <th className="sticky left-0 z-10 min-w-[200px] bg-bg-input/40 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.masterColumn}
              </th>
              {week.days.map((day) => (
                <th
                  key={day.dateKey}
                  className={cn(
                    "px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wide",
                    day.isToday ? "text-primary" : "text-text-sec",
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
                      <FocalImage
                        src={row.master.avatarUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-input text-[9px] font-semibold text-text-sec ring-1 ring-border-subtle"
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
                      <span className="font-mono text-[11px] text-text-sec/60">
                        {T.dayOff}
                      </span>
                    ) : (
                      <Link
                        href={`?view=day&date=${cell.dateKey}`}
                        scroll={false}
                        className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/5"
                      >
                        <p className="font-mono text-xs font-semibold tabular-nums text-text-main">
                          {T.occupancyTemplate
                            .replace("{booked}", String(cell.booked))
                            .replace("{total}", String(cell.capacity))}
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

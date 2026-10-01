import { Users } from "lucide-react";
import { ResilientImage } from "@/components/ui/resilient-image";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioTodayBannerData } from "../server/types";
import { UI_FMT } from "@/lib/ui/fmt";

type Props = {
  data: StudioTodayBannerData;
  studioName: string;
};

const T = UI_TEXT.studioCabinet.dashboardV2.banner;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

/**
 * Дата «сегодня» — по поясу СТУДИИ (salon-tz, rule 17): баннер рендерится на
 * сервере, и без пояса дата шла по часам контейнера (у студии в Екатеринбурге
 * с 00:00 до 05:00 — вчерашний день). Метка зоны не нужна: это дата студии в
 * её собственном кабинете.
 */
function formatToday(now: Date, timeZone: string): string {
  return UI_FMT.date(now, "weekdayDayMonthLong", { timeZone });
}

export function StudioTodayBanner({ data, studioName }: Props) {
  const today = formatToday(new Date(), data.timeZone);
  const visibleMasters = data.mastersOnShift.slice(0, 5);
  const extraCount = Math.max(0, data.mastersOnShift.length - visibleMasters.length);

  // STUDIO-POLISH-A #2: explicit `text-white` (mirrors master's
  // GreetingHero). The previous `text-[rgb(var(--accent-fg))]` resolved to
  // a near-black in light theme, making the title unreadable on the
  // burgundy gradient. Title template now interpolates `{studioName}`
  // so the headline names the studio directly.
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white md:p-7">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_85%_30%,rgba(255,255,255,0.18),transparent_50%)]"
      />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="mb-2 eyebrow text-white opacity-75">
            {today}
          </div>
          <h2 className="font-display text-2xl font-bold leading-tight md:text-3xl">
            {T.title(studioName, data.bookingsToday)}
          </h2>
          <p className="mt-2 max-w-xl text-sm opacity-90 md:text-[15px]">
            {T.subtitleTemplate
              .replace("{onShift}", String(data.mastersOnShift.length))
              .replace("{load}", String(data.averageLoadPercent))}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="eyebrow text-white opacity-70">
            {T.onShiftLabel}
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/15 px-3.5 py-2.5 backdrop-blur">
            <div className="flex">
              {visibleMasters.length === 0 ? (
                <Users className="h-7 w-7 opacity-80" aria-hidden />
              ) : (
                visibleMasters.map((master, index) => (
                  <span
                    key={master.id}
                    className="inline-grid h-8 w-8 place-items-center rounded-full border-2 border-white/25 bg-white/20 text-2xs font-bold"
                    style={{ marginLeft: index === 0 ? 0 : -10 }}
                    aria-label={master.name}
                  >
                    {master.avatarUrl ? (
                      <ResilientImage
                        src={master.avatarUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      initialsOf(master.name)
                    )}
                  </span>
                ))
              )}
            </div>
            {extraCount > 0 ? (
              <span className="text-sm font-semibold">+{extraCount}</span>
            ) : null}
            <span aria-hidden className="h-7 w-px bg-white/25" />
            <div className="font-display text-xl tabular-nums">
              {data.mastersOnShift.length}
              <span className="ml-1 text-xs font-normal opacity-70">
                {T.outOfTemplate.replace("{total}", String(data.totalMasters))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

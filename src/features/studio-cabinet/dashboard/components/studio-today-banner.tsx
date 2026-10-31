import { Users } from "lucide-react";
import { ResilientImage } from "@/components/ui/resilient-image";
import { TrialStatusBadge } from "@/features/cabinet/components/trial-status-badge";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioTodayBannerData } from "../server/types";
import { UI_FMT } from "@/lib/ui/fmt";

type Props = {
  data: StudioTodayBannerData;
  studioName: string;
  /**
   * Конец пробного периода (ISO) — плашка «PREMIUM · N дней» стоит только
   * здесь, на главной, а не над каждой страницей кабинета.
   */
  trialEndsAt?: string | null;
};

const T = UI_TEXT.studioCabinet.dashboardV2.today;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

/**
 * Шапка главной студии (DASHBOARD-REORDER, 2026-10-31): название, дата,
 * сколько записей сегодня и кто на смене — одной компактной карточкой вместо
 * высокого баннера, чтобы «Требуют внимания» и ближайшие записи были видны
 * сразу (особенно в установленном приложении).
 *
 * Дата «сегодня» — по поясу СТУДИИ (salon-tz, rule 17): карточка рендерится
 * на сервере, и без пояса дата шла бы по часам контейнера. Метка зоны не
 * нужна: это дата студии в её собственном кабинете.
 */
export function StudioTodayBanner({ data, studioName, trialEndsAt = null }: Props) {
  const today = UI_FMT.date(new Date(), "weekdayDayMonthLong", { timeZone: data.timeZone });
  const visibleMasters = data.mastersOnShift.slice(0, 4);
  const extraCount = Math.max(0, data.mastersOnShift.length - visibleMasters.length);

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 md:px-5"
      data-testid="studio-today"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">{today}</span>
          {trialEndsAt ? <TrialStatusBadge trialEndsAt={trialEndsAt} /> : null}
        </div>
        <h1 className="mt-0.5 truncate font-display text-lg text-text-main md:text-xl">{studioName}</h1>
        <p className="text-sm text-text-sec">{T.bookings(data.bookingsToday)}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center">
          {visibleMasters.length === 0 ? (
            <Users className="h-5 w-5 text-text-sec" aria-hidden />
          ) : (
            visibleMasters.map((master, index) => (
              <span
                key={master.id}
                className="inline-grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-bg-card bg-bg-input text-3xs font-semibold text-text-sec"
                style={{ marginLeft: index === 0 ? 0 : -8 }}
                aria-hidden
              >
                {master.avatarUrl ? (
                  <ResilientImage
                    src={master.avatarUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  initialsOf(master.name)
                )}
              </span>
            ))
          )}
          {extraCount > 0 ? <span className="ml-1 text-xs font-semibold text-text-sec">+{extraCount}</span> : null}
        </div>
        <span className="text-xs text-text-sec">{T.onShift(data.mastersOnShift.length, data.totalMasters)}</span>
      </div>
    </section>
  );
}

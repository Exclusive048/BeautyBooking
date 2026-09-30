import { redirect } from "next/navigation";
import { FooterHint } from "@/features/master/components/schedule/footer-hint";
import { RefreshButton } from "@/features/master/components/schedule/refresh-button";
import { ScheduleControls } from "@/features/master/components/schedule/schedule-controls";
import { ScheduleKpiCards } from "@/features/master/components/schedule/schedule-kpi-cards";
import { ScheduleLegend } from "@/features/master/components/schedule/schedule-legend";
import { DayView, type DayStripItem } from "@/features/master/components/schedule/day-view";
import { parseScheduleView } from "@/features/master/components/schedule/schedule-view-state";
import { HOUR_PX, WeekGrid } from "@/features/master/components/schedule/week-grid";
import { WeekGridColumn } from "@/features/master/components/schedule/week-grid-column";
import { NewBookingButton } from "@/features/master/components/manual-booking/new-booking-button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { ScheduleSettingsLink } from "@/features/master/components/schedule/schedule-settings-link";
import { getSessionUserId } from "@/lib/auth/session";
import { getCurrentMasterProviderId, getMasterWorkProfiles } from "@/lib/master/access";
import { getMasterScheduleWeek } from "@/lib/master/schedule.service";
import { resolveDefaultScheduleView } from "@/lib/master/schedule-view";
import {
  formatWeekRange,
  parseWeekStart,
  toIsoDateKey,
} from "@/lib/master/schedule-utils";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

function pluralizeBookings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return T.schedule.bookingsLabelOne;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return T.schedule.bookingsLabelFew;
  return T.schedule.bookingsLabelMany;
}

type Props = {
  searchParams: { weekStart?: string; view?: string; day?: string };
};

/**
 * Server orchestrator for `/cabinet/master/schedule`. Parses `?weekStart=`
 * (default: current Monday), fetches the entire week dataset in one
 * round-trip via `getMasterScheduleWeek`, and composes the page from
 * server-rendered sections + a handful of client islands (refresh button,
 * actions menu, reschedule modal, click-to-create overlay).
 */
export async function MasterSchedulePage({ searchParams }: Props) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const weekStart = parseWeekStart(searchParams.weekStart);
  const masterId = await getCurrentMasterProviderId(userId);
  // STUDIO-MASTER-PROFILES (этап 4): записи в сетке — всех профилей мастера;
  // рабочие часы и перерывы — личного профиля (расписания у профилей раздельные).
  const workProfiles = await getMasterWorkProfiles(userId);
  // PWA-UX-BATCH-01: вид — из `?view=`, иначе по устройству (телефон → день).
  const [data, view] = await Promise.all([
    getMasterScheduleWeek({ masterId, weekStart, workProfiles }),
    Promise.resolve(parseScheduleView(searchParams.view) ?? resolveDefaultScheduleView()),
  ]);
  // «Сегодня» — в зоне мастера (rule 17, salon-tz), не хоста и не браузера.
  const todayIso = toLocalDateKey(new Date(), data.timezone);
  const weekStartIso = toIsoDateKey(weekStart);

  const subtitle = T.schedule.subtitleTemplate
    .replace("{range}", formatWeekRange(weekStart))
    .replace(
      "{bookingsLabel}",
      `${data.totalBookings} ${pluralizeBookings(data.totalBookings)}`,
    )
    .replace("{revenue}", formatRub(data.weekRevenue));

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.schedule.breadcrumb },
        ]}
        title={T.schedule.title}
        subtitle={subtitle}
        actions={
          <>
            <ScheduleSettingsLink />
            <RefreshButton />
            <NewBookingButton label={T.pageHeader.newBookingCta} className="rounded-xl" compactBelowMd />
          </>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-6 lg:px-8">
        <ScheduleControls weekStartIso={weekStartIso} todayIso={todayIso} view={view} />
        <ScheduleKpiCards stats={data.kpi} showWorkContext={data.showWorkContext} />
        <ScheduleLegend showWorkContext={data.showWorkContext} />
        {view === "day" ? (
          <DayView
            weekStartIso={weekStartIso}
            todayIso={todayIso}
            days={data.days.map<DayStripItem>((d) => ({
              iso: d.iso,
              shortLabel: d.weekDay.shortLabel,
              dayNumber: d.weekDay.dayNumber,
              isToday: d.weekDay.isToday,
              isOff: d.isOff,
              bookingsCount: d.bookings.length,
            }))}
            hourRange={data.hourRange}
            hourPx={HOUR_PX}
            // Колонки рендерятся на сервере (те же, что в недельной сетке);
            // клиентский DayView только выбирает одну. `?day=` вне недели
            // резолвится тем же правилом, что и в контролах.
            columns={Object.fromEntries(
              data.days.map((d) => [
                d.iso,
                <WeekGridColumn
                  key={d.iso}
                  day={d}
                  hourStart={data.hourRange.start}
                  hourEnd={data.hourRange.end}
                  hourPx={HOUR_PX}
                  timezone={data.timezone}
                  showWorkContext={data.showWorkContext}
                  wideCards
                />,
              ]),
            )}
          />
        ) : (
          <WeekGrid
            days={data.days}
            hourRange={data.hourRange}
            timezone={data.timezone}
            showWorkContext={data.showWorkContext}
          />
        )}
        <FooterHint fetchedAt={data.fetchedAt} timezone={data.timezone} />
      </div>
    </>
  );
}

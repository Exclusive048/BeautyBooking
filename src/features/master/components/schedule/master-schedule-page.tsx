import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FooterHint } from "@/features/master/components/schedule/footer-hint";
import { RefreshButton } from "@/features/master/components/schedule/refresh-button";
import { ScheduleControls } from "@/features/master/components/schedule/schedule-controls";
import { ScheduleKpiCards } from "@/features/master/components/schedule/schedule-kpi-cards";
import { ScheduleLegend } from "@/features/master/components/schedule/schedule-legend";
import { WeekGrid } from "@/features/master/components/schedule/week-grid";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUserId } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterScheduleWeek } from "@/lib/master/schedule.service";
import {
  formatWeekRange,
  parseWeekStart,
  toIsoDateKey,
} from "@/lib/master/schedule-utils";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;

const moneyFmt = new Intl.NumberFormat("ru-RU");
function formatRub(value: number): string {
  return `${moneyFmt.format(Math.round(value))} ₽`;
}

function pluralizeBookings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return T.schedule.bookingsLabelOne;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return T.schedule.bookingsLabelFew;
  return T.schedule.bookingsLabelMany;
}

type Props = {
  searchParams: { weekStart?: string };
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
  const data = await getMasterScheduleWeek({ masterId, weekStart });

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
            <RefreshButton />
            <Button asChild variant="primary" size="md" className="rounded-xl">
              <Link href="/cabinet/master/dashboard?manual=1">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                {T.pageHeader.newBookingCta}
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-6 lg:px-8">
        <ScheduleControls weekStartIso={toIsoDateKey(weekStart)} />
        <ScheduleKpiCards stats={data.kpi} />
        <ScheduleLegend />
        <WeekGrid days={data.days} hourRange={data.hourRange} />
        <FooterHint fetchedAt={data.fetchedAt} />
      </div>
    </>
  );
}

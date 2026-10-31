import { redirect } from "next/navigation";
import { groupByDateKey } from "@/features/bookings-journal/lib/group-by-date";
import {
  journalHref,
  parseJournalParams,
  JOURNAL_MAX_LIMIT,
  JOURNAL_PAGE_SIZE,
  type JournalRawParams,
} from "@/features/bookings-journal/lib/journal-params";
import { isJournalStatusInactive, journalStatusKey } from "@/features/bookings-journal/lib/journal-status";
import { StudioBookingsPage } from "@/features/studio-cabinet/bookings/components/studio-bookings-page";
import type { StudioJournalDay } from "@/features/studio-cabinet/bookings/components/studio-journal-days";
import { listStudioBookings } from "@/features/studio-cabinet/bookings/server/bookings-list.service";
import {
  countStudioAwaitingBookings,
  loadStudioMasterOptions,
} from "@/features/studio-cabinet/bookings/server/bookings-kpis.service";
import { loadStudioCabinetShellExtras } from "@/features/studio-cabinet/schedule/server/shell-extras.service";
import { getSessionUser } from "@/lib/auth/session";
import { bookingStatusGroupFilter } from "@/lib/bookings/status-groups";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

const PAGE_PATH = "/cabinet/studio/bookings";

type SearchParams = JournalRawParams & { master?: string; focus?: string };

type Props = {
  searchParams?: Promise<SearchParams>;
};

export const dynamic = "force-dynamic";

/**
 * BOOKINGS-JOURNAL — журнал записей студии. Без параметров — сегодняшний день
 * САЛОНА (salon-tz: «сегодня» считается в поясе студии, а не сервера);
 * `?date=` / `?view=week` — день или неделя; поиск `?q=` и `?upcoming=1` —
 * все предстоящие с начала сегодняшнего дня салона, без привязки к дате.
 */
export default async function StudioBookingsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params: SearchParams = { ...((await searchParams) ?? {}) };
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { provider: { select: { timezone: true } } },
  });
  const timezone = studio?.provider.timezone || env.DEFAULT_TIMEZONE;
  const now = new Date();
  const todayKey = toLocalDateKey(now, timezone);
  // `?focus=` из уведомления — журнал открывается на дне этой записи.
  if (params.focus && !params.date && !params.q && params.upcoming !== "1") {
    const focused = await prisma.booking.findFirst({
      where: { AND: [{ id: params.focus }, studioBookingsWhere(studioId)] },
      select: { startAtUtc: true },
    });
    const focusDate = focused?.startAtUtc ? toLocalDateKey(focused.startAtUtc, timezone) : null;
    if (focusDate && focusDate !== todayKey) params.date = focusDate;
  }
  const state = parseJournalParams(params, todayKey);
  const masterId = params.master?.trim() || "all";

  const [list, awaitingCount, masterOptions, shellExtras] = await Promise.all([
    listStudioBookings({
      studioId,
      filters: {
        range: "all",
        window: {
          fromUtc: localDayRangeUtc(state.window.fromKey, timezone).startUtc,
          toUtcExclusive: state.window.toKeyExclusive
            ? localDayRangeUtc(state.window.toKeyExclusive, timezone).startUtc
            : null,
        },
        status: bookingStatusGroupFilter(state.status),
        masterId,
        search: state.search,
      },
      page: { offset: 0, limit: state.limit },
      withRangeCounts: false,
    }),
    countStudioAwaitingBookings(studioId, timezone),
    loadStudioMasterOptions(studioId),
    loadStudioCabinetShellExtras(studioId),
  ]);

  const rows = list.items.map((row) => ({
    row,
    statusKey: journalStatusKey({
      status: row.status,
      startAtUtc: new Date(row.startAtUtc),
      endAtUtc: new Date(row.endAtUtc),
      now,
    }),
  }));
  const days: StudioJournalDay[] = groupByDateKey(rows, ({ row }) => {
    const start = new Date(row.startAtUtc);
    return Number.isNaN(start.getTime()) ? null : toLocalDateKey(start, timezone);
  }).map((group) => ({
    dateKey: group.dateKey,
    rows: group.items,
    revenueKopeks: group.items.reduce(
      (sum, item) => (isJournalStatusInactive(item.statusKey) ? sum : sum + item.row.priceKopeks),
      0,
    ),
  }));

  const href = (patch: Record<string, string | null>) => journalHref(PAGE_PATH, params, patch);

  return (
    <StudioBookingsPage
      studioId={studioId}
      timezone={timezone}
      zoneIso={localDayRangeUtc(state.mode === "date" ? state.dateKey : todayKey, timezone).startUtc.toISOString()}
      state={state}
      masterId={masterId}
      days={days}
      visibleCount={list.items.length}
      hrefs={{
        loadMore: list.nextCursor && state.limit < JOURNAL_MAX_LIMIT ? href({ limit: String(state.limit + JOURNAL_PAGE_SIZE) }) : null,
        backToDay: href({ q: null, upcoming: null }),
        resetFilters: href({ status: null, master: null }),
        upcoming: href({ upcoming: "1", q: null }),
        awaiting: href({ status: "awaiting", upcoming: "1", q: null }),
      }}
      awaitingCount={awaitingCount}
      masterOptions={masterOptions}
      scheduleMasters={shellExtras.scheduleMasters}
      services={shellExtras.services}
    />
  );
}

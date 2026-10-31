import { redirect } from "next/navigation";
import { FocusHighlighter } from "@/components/cabinet/focus-highlighter";
import {
  JournalAttentionBar,
  JournalDaySection,
  JournalEmpty,
  JournalLoadMore,
  JournalModeNote,
  type JournalListMode,
} from "@/features/bookings-journal/components/journal-sections";
import { JournalToolbar } from "@/features/bookings-journal/components/journal-toolbar";
import { groupByDateKey } from "@/features/bookings-journal/lib/group-by-date";
import {
  JOURNAL_MAX_LIMIT,
  JOURNAL_PAGE_SIZE,
  journalHref,
  parseJournalParams,
  type JournalRawParams,
} from "@/features/bookings-journal/lib/journal-params";
import { isJournalStatusInactive, journalStatusKey } from "@/features/bookings-journal/lib/journal-status";
import { MasterJournalRow } from "@/features/master/components/bookings/master-journal-row";
import { NewBookingButton } from "@/features/master/components/manual-booking/new-booking-button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUserId } from "@/lib/auth/session";
import { getPendingBookingsCountForMaster } from "@/lib/bookings/counts";
import { shouldShowWorkContext } from "@/lib/bookings/work-context";
import { env } from "@/lib/env";
import { getCurrentMasterProviderId, getMasterWorkProfiles } from "@/lib/master/access";
import { loadMasterBookingsJournal, resolveMasterFocusDateKey } from "@/lib/master/bookings-journal.service";
import { verifyClientKeyToken } from "@/lib/master/client-key-token";
import { prisma } from "@/lib/prisma";
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;
const J = UI_TEXT.schedule.bookingsJournal;
const PAGE_PATH = "/cabinet/master/bookings";

export type MasterBookingsSearchParams = JournalRawParams & {
  /** Токен истории клиента из карточки клиента («Вся история»). */
  client?: string;
  /** Запись из уведомления — журнал открывается на её дне. */
  focus?: string;
};

/**
 * BOOKINGS-JOURNAL — журнал записей мастера (`/cabinet/master/bookings`).
 * По умолчанию — сегодняшний день САЛОНА (salon-tz: пояс кабинета мастера),
 * записи по дням, выбор дня и недели, одна строка поиска (клиент, услуга,
 * телефон) — по всем предстоящим без привязки к дате, «все предстоящие»,
 * фильтр состояния. `?client=` — история одного клиента (свежие первыми),
 * `?focus=` — день записи из уведомления.
 */
export async function MasterBookingsPage({ searchParams }: { searchParams: MasterBookingsSearchParams }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const [masterId, workProfiles] = await Promise.all([
    getCurrentMasterProviderId(userId),
    getMasterWorkProfiles(userId),
  ]);
  const provider = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { timezone: true },
  });
  const timezone = provider?.timezone || env.DEFAULT_TIMEZONE;
  const now = new Date();
  const todayKey = toLocalDateKey(now, timezone);

  // MASTER-CLIENTS-FIX-A #7а: токен истории клиента проверяется против
  // текущего мастера; чужой или протухший — журнал без фильтра.
  const clientKey = searchParams.client
    ? verifyClientKeyToken({ token: searchParams.client, masterProviderId: masterId })
    : null;

  const params: MasterBookingsSearchParams = { ...searchParams };
  if (params.focus && !params.date && !params.q && params.upcoming !== "1" && !clientKey) {
    const focusDate = await resolveMasterFocusDateKey({
      bookingId: params.focus,
      workProfileIds: workProfiles.allIds,
      timeZone: timezone,
    });
    if (focusDate && focusDate !== todayKey) params.date = focusDate;
  }

  const state = parseJournalParams(params, todayKey);
  const mode: JournalListMode = clientKey ? "client" : state.mode;

  const [journal, awaitingCount] = await Promise.all([
    loadMasterBookingsJournal({
      workProfileIds: workProfiles.allIds,
      timeZone: timezone,
      window: mode === "client" ? null : state.window,
      search: state.search,
      status: state.status,
      clientKey,
      limit: state.limit,
      order: mode === "client" ? "desc" : "asc",
      now,
    }),
    getPendingBookingsCountForMaster(workProfiles.allIds),
  ]);

  const rows = journal.items.map((item) => ({
    item,
    statusKey: journalStatusKey({
      status: item.status,
      startAtUtc: item.startAtUtc ? new Date(item.startAtUtc) : null,
      endAtUtc: item.endAtUtc ? new Date(item.endAtUtc) : null,
      now,
    }),
  }));
  const days = groupByDateKey(rows, ({ item }) =>
    item.startAtUtc ? toLocalDateKey(new Date(item.startAtUtc), timezone) : null,
  );
  const showWorkContext = shouldShowWorkContext({
    masterInStudio: workProfiles.worksInStudio,
    contexts: journal.items.map((item) => item.workContext),
  });

  const href = (patch: Record<string, string | null>) => journalHref(PAGE_PATH, params, patch);
  const loadMoreHref =
    journal.hasMore && state.limit < JOURNAL_MAX_LIMIT ? href({ limit: String(state.limit + JOURNAL_PAGE_SIZE) }) : null;
  const filtered = state.status !== "all";
  const showAttention = mode === "date" && !filtered && awaitingCount > 0;

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.bookings.breadcrumb },
        ]}
        title={T.bookings.title}
        actions={<NewBookingButton label={T.pageHeader.newBookingCta} className="rounded-xl" />}
      />
      <FocusHighlighter />

      <div className="space-y-4 px-4 py-4 md:px-6 lg:px-8">
        <JournalToolbar
          view={state.view}
          dateKey={state.dateKey}
          todayKey={todayKey}
          search={state.search}
          mode={mode}
          status={state.status}
          searchPlaceholder={J.searchPlaceholderMaster}
          timeZone={timezone}
          zoneIso={localDayRangeUtc(mode === "date" ? state.dateKey : todayKey, timezone).startUtc.toISOString()}
        />

        {mode !== "date" ? (
          <JournalModeNote mode={mode} search={state.search} backHref={href({ q: null, upcoming: null, client: null })} />
        ) : null}
        {showAttention ? (
          <JournalAttentionBar
            count={awaitingCount}
            href={href({ status: "awaiting", upcoming: "1", q: null, client: null })}
          />
        ) : null}

        {days.length > 0 ? (
          <div className="space-y-5">
            {days.map((day) => (
              <JournalDaySection
                key={day.dateKey ?? "none"}
                dateKey={day.dateKey}
                todayKey={todayKey}
                count={day.items.length}
                revenueKopeks={day.items.reduce(
                  (sum, { item, statusKey }) => (isJournalStatusInactive(statusKey) ? sum : sum + item.price),
                  0,
                )}
              >
                {day.items.map(({ item, statusKey }) => (
                  <MasterJournalRow
                    key={item.id}
                    item={item}
                    statusKey={statusKey}
                    cabinetTimeZone={timezone}
                    showWorkContext={showWorkContext}
                  />
                ))}
              </JournalDaySection>
            ))}
          </div>
        ) : (
          <JournalEmpty
            mode={mode}
            view={state.view}
            search={state.search}
            filtered={filtered}
            resetHref={href({ status: null })}
            upcomingHref={href({ upcoming: "1", q: null, client: null })}
          />
        )}

        {loadMoreHref ? <JournalLoadMore href={loadMoreHref} /> : null}
      </div>
    </>
  );
}

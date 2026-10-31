import { FocusHighlighter } from "@/components/cabinet/focus-highlighter";
import {
  JournalAttentionBar,
  JournalEmpty,
  JournalLoadMore,
  JournalModeNote,
} from "@/features/bookings-journal/components/journal-sections";
import { JournalToolbar } from "@/features/bookings-journal/components/journal-toolbar";
import type { JournalState } from "@/features/bookings-journal/lib/journal-params";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import * as UI_TEXT from "@/lib/ui/text";
import type { MasterOption } from "../server/types";
import { BookingsHeader } from "./bookings-header";
import { StudioJournalDays, type StudioJournalDay } from "./studio-journal-days";

const J = UI_TEXT.schedule.bookingsJournal;

export type StudioJournalHrefs = {
  loadMore: string | null;
  /** Из поиска и «всех предстоящих» — к выбранному дню. */
  backToDay: string;
  resetFilters: string;
  upcoming: string;
  awaiting: string;
};

type Props = {
  studioId: string;
  timezone: string;
  /** Начало показанного дня (UTC ISO) — подпись пояса салона. */
  zoneIso: string;
  state: JournalState;
  masterId: string;
  days: StudioJournalDay[];
  visibleCount: number;
  hrefs: StudioJournalHrefs;
  /** Записей ждут ответа студии — подсказка над днём. */
  awaitingCount: number;
  masterOptions: MasterOption[];
  scheduleMasters: ScheduleMasterColumn[];
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceKopeks: number;
    masterIds: string[];
  }>;
};

/**
 * BOOKINGS-JOURNAL — журнал записей студии: по умолчанию сегодняшний день
 * салона, записи по дням, выбор даты и недели, одна строка поиска (клиент,
 * мастер, услуга, телефон — по всем предстоящим), фильтры состояния и мастера.
 * Время — пояс салона (salon-tz), как в календаре студии.
 */
export function StudioBookingsPage({
  studioId,
  timezone,
  zoneIso,
  state,
  masterId,
  days,
  visibleCount,
  hrefs,
  awaitingCount,
  masterOptions,
  scheduleMasters,
  services,
}: Props) {
  const filtered = state.status !== "all" || masterId !== "all";
  // «Ждут ответа» — подсказка, когда их не видно: на сегодняшнем дне без
  // фильтра состояния и не в поиске.
  const showAttention = state.mode === "date" && state.status === "all" && !filtered && awaitingCount > 0;

  return (
    <div className="space-y-4 lg:space-y-5">
      <BookingsHeader
        studioId={studioId}
        visibleCount={visibleCount}
        masters={scheduleMasters}
        services={services}
        timezone={timezone}
      />

      <FocusHighlighter />

      <JournalToolbar
        view={state.view}
        dateKey={state.dateKey}
        todayKey={state.todayKey}
        search={state.search}
        mode={state.mode}
        status={state.status}
        searchPlaceholder={J.searchPlaceholderStudio}
        masters={masterOptions}
        masterId={masterId}
        timeZone={timezone}
        zoneIso={zoneIso}
      />

      {state.mode === "upcoming" ? <JournalModeNote search={state.search} backHref={hrefs.backToDay} /> : null}
      {showAttention ? <JournalAttentionBar count={awaitingCount} href={hrefs.awaiting} /> : null}

      {days.length > 0 ? (
        <StudioJournalDays
          studioId={studioId}
          days={days}
          todayKey={state.todayKey}
          masters={scheduleMasters}
          timezone={timezone}
        />
      ) : (
        <JournalEmpty
          mode={state.mode}
          view={state.view}
          search={state.search}
          filtered={filtered}
          resetHref={hrefs.resetFilters}
          upcomingHref={hrefs.upcoming}
        />
      )}

      {hrefs.loadMore ? <JournalLoadMore href={hrefs.loadMore} /> : null}
    </div>
  );
}

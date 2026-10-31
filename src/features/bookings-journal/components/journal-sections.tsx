import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, CalendarSearch, ChevronDown, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { pluralize } from "@/lib/utils/pluralize";
import type { JournalView } from "../lib/journal-params";

const T = UI_TEXT.schedule.bookingsJournal;

/**
 * BOOKINGS-JOURNAL — общие блоки журнала записей (кабинеты мастера и студии):
 * заголовок дня, пометка режима, «ждут ответа», «Показать ещё», пустые
 * состояния. Без состояния и хуков — рендерятся на сервере страницы.
 */

export function bookingsCountLabel(count: number): string {
  return `${UI_FMT.count(count)} ${pluralize(count, T.bookingOne, T.bookingFew, T.bookingMany)}`;
}

/** «Сегодня · пятница, 31 октября»; дата салона (salon-tz), другой год — с годом. */
export function journalDayTitle(dateKey: string, todayKey: string): string {
  const otherYear = dateKey.slice(0, 4) !== todayKey.slice(0, 4);
  const date = UI_FMT.dateKey(dateKey, otherYear ? "dayMonthYearLong" : "weekdayDayMonthLong");
  const prefix =
    dateKey === todayKey
      ? T.dayToday
      : dateKey === addDaysToDateKey(todayKey, 1)
        ? T.dayTomorrow
        : dateKey === addDaysToDateKey(todayKey, -1)
          ? T.dayYesterday
          : null;
  return prefix ? `${prefix} · ${date}` : date;
}

/** День журнала: заголовок с числом записей и суммой, под ним — список. */
export function JournalDaySection({
  dateKey,
  todayKey,
  count,
  revenueKopeks,
  children,
}: {
  dateKey: string | null;
  todayKey: string;
  count: number;
  /** Сумма записей дня без отменённых и неявок; `null` — не показывать. */
  revenueKopeks: number | null;
  children: ReactNode;
}) {
  const title = dateKey ? journalDayTitle(dateKey, todayKey) : T.noTime;
  const meta = [bookingsCountLabel(count), revenueKopeks && revenueKopeks > 0 ? UI_FMT.priceLabel(revenueKopeks) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-label={title} data-testid="bookings-journal-day" data-date={dateKey ?? undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1 pb-2">
        <h2 className="font-display text-base font-semibold text-text-main first-letter:uppercase">{title}</h2>
        <p className="text-xs tabular-nums text-text-sec">{meta}</p>
      </div>
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
        {children}
      </ul>
    </section>
  );
}

/** Журнал вне выбранного дня: поиск, все предстоящие, история клиента. */
export type JournalListMode = "date" | "upcoming" | "client";

function modeNoteText(mode: JournalListMode, search: string): string {
  if (mode === "client") return search ? T.clientSearchNote(search) : T.clientHistoryNote;
  return search ? T.searchNote(search) : T.upcomingNote;
}

/** Показан не день — пометка, что показано, и путь назад к дню. */
export function JournalModeNote({
  mode = "upcoming",
  search,
  backHref,
}: {
  mode?: JournalListMode;
  search: string;
  backHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl border border-border-subtle bg-bg-input/40 px-4 py-2.5">
      <p className="min-w-0 text-sm text-text-main" data-testid="bookings-journal-mode-note">
        {modeNoteText(mode, search)}
      </p>
      <Link href={backHref} scroll={false} className="shrink-0 text-sm font-medium text-accent-text hover:underline">
        {T.backToDay}
      </Link>
    </div>
  );
}

/** Сколько записей ждут ответа — с переходом к ним. */
export function JournalAttentionBar({ count, href }: { count: number; href: string }) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-warning-border bg-warning-surface px-4 py-2.5">
      <p className="flex min-w-0 items-center gap-2 text-sm text-warning-text">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold tabular-nums">{UI_FMT.count(count)}</span>{" "}
          {pluralize(count, T.awaitingOne, T.awaitingFew, T.awaitingMany)}
        </span>
      </p>
      <Button asChild variant="secondary" size="sm" className="shrink-0 rounded-lg">
        <Link href={href} scroll={false} data-testid="bookings-journal-awaiting">
          {T.awaitingShow}
        </Link>
      </Button>
    </div>
  );
}

export function JournalLoadMore({ href }: { href: string }) {
  return (
    <div className="flex justify-center">
      <Button asChild variant="secondary" size="md" className="rounded-xl">
        <Link href={href} scroll={false} data-testid="bookings-journal-load-more">
          <ChevronDown className="h-4 w-4" aria-hidden />
          {T.loadMore}
        </Link>
      </Button>
    </div>
  );
}

export function JournalEmpty({
  mode,
  view,
  search,
  filtered,
  resetHref,
  upcomingHref,
}: {
  mode: JournalListMode;
  view: JournalView;
  search: string;
  /** Стоит фильтр состояния или мастера. */
  filtered: boolean;
  resetHref: string;
  upcomingHref: string;
}) {
  if (mode === "client" && !filtered && !search) {
    return <EmptyState variant="card" icon={CalendarSearch} title={T.emptyClientTitle} />;
  }
  if (filtered) {
    return (
      <EmptyState
        variant="card"
        icon={SearchX}
        title={
          search
            ? T.emptySearchTitle
            : mode === "client"
              ? T.emptyClientTitle
              : mode === "upcoming"
                ? T.emptyUpcomingTitle
                : view === "week"
                  ? T.emptyWeekTitle
                  : T.emptyDayTitle
        }
        description={T.emptyFilteredHint}
        action={{ label: T.resetFilters, href: resetHref }}
      />
    );
  }
  if (search) {
    return <EmptyState variant="card" icon={SearchX} title={T.emptySearchTitle} description={T.emptySearchHint} />;
  }
  if (mode === "upcoming") {
    return <EmptyState variant="card" icon={CalendarSearch} title={T.emptyUpcomingTitle} />;
  }
  return (
    <EmptyState
      variant="card"
      icon={CalendarSearch}
      title={view === "week" ? T.emptyWeekTitle : T.emptyDayTitle}
      description={T.emptyDateHint}
      action={{ label: T.upcoming, href: upcomingHref }}
    />
  );
}

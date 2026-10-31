import { isValidDateKey, mondayOf } from "@/features/schedule-nav/lib/month-grid";
import { parseBookingStatusGroup, type BookingStatusGroup } from "@/lib/bookings/status-groups";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";

/**
 * BOOKINGS-JOURNAL — состояние журнала записей (кабинеты мастера и студии)
 * из адреса страницы. Чистый модуль: ключи дат салона `YYYY-MM-DD`, пояса
 * здесь нет — перевод в UTC делает сервер (`journal-where.ts`).
 *
 * Правила (запрос владельца 2026-10-31):
 *   - без параметров — записи СЕГОДНЯШНЕГО дня салона;
 *   - `?date=` — выбранный день, `?view=week` — неделя с понедельника;
 *   - поиск (`?q=`) ищет без привязки к дате — по всем предстоящим записям
 *     (с начала сегодняшнего дня салона); выбранная дата при этом остаётся
 *     в адресе: очистили поиск — вернулись к ней;
 *   - `?upcoming=1` — все предстоящие без поиска;
 *   - `?limit=` — сколько записей показано («Показать ещё»).
 */

export type JournalView = "day" | "week";
export type JournalMode = "date" | "upcoming";

export const JOURNAL_PAGE_SIZE = 50;
export const JOURNAL_MAX_LIMIT = 500;
/** Длиннее имя с фамилией и телефон не бывают — остальное отбрасывается. */
export const JOURNAL_SEARCH_MAX_LENGTH = 80;

export type JournalRawParams = {
  date?: string;
  view?: string;
  q?: string;
  upcoming?: string;
  limit?: string;
  status?: string;
};

/** Окно дат салона: `[fromKey, toKeyExclusive)`; у «предстоящих» конца нет. */
export type JournalWindow = { fromKey: string; toKeyExclusive: string | null };

export type JournalState = {
  view: JournalView;
  /** Выбранный день (в виде «неделя» — любой день недели). */
  dateKey: string;
  todayKey: string;
  search: string;
  mode: JournalMode;
  status: BookingStatusGroup | "all";
  limit: number;
  window: JournalWindow;
};

function parseLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= JOURNAL_PAGE_SIZE) return JOURNAL_PAGE_SIZE;
  return Math.min(parsed, JOURNAL_MAX_LIMIT);
}

/** Окно выбранного периода: день либо неделя с понедельника. */
export function journalDateWindow(view: JournalView, dateKey: string): JournalWindow {
  if (view === "week") {
    const monday = mondayOf(dateKey);
    return { fromKey: monday, toKeyExclusive: addDaysToDateKey(monday, 7) };
  }
  return { fromKey: dateKey, toKeyExclusive: addDaysToDateKey(dateKey, 1) };
}

export function parseJournalParams(raw: JournalRawParams | undefined, todayKey: string): JournalState {
  const search = (raw?.q ?? "").trim().slice(0, JOURNAL_SEARCH_MAX_LENGTH);
  const view: JournalView = raw?.view === "week" ? "week" : "day";
  const date = raw?.date;
  const dateKey = isValidDateKey(date) ? date : todayKey;
  const mode: JournalMode = search || raw?.upcoming === "1" ? "upcoming" : "date";
  return {
    view,
    dateKey,
    todayKey,
    search,
    mode,
    status: parseBookingStatusGroup(raw?.status),
    limit: parseLimit(raw?.limit),
    window: mode === "upcoming" ? { fromKey: todayKey, toKeyExclusive: null } : journalDateWindow(view, dateKey),
  };
}

/** Параметр адреса: значение либо `null` — убрать из адреса. */
export type JournalParamPatch = Record<string, string | null>;

/**
 * Адрес журнала с правкой параметров. Любая правка, кроме самого `limit`,
 * сбрасывает «Показать ещё» и подсветку записи (`focus`): показан другой
 * набор, и прежняя граница к нему не относится.
 */
export function journalHref(
  pathname: string,
  current: Readonly<Record<string, string | undefined>> | URLSearchParams,
  patch: JournalParamPatch,
): string {
  const next = new URLSearchParams();
  const entries = current instanceof URLSearchParams ? Array.from(current.entries()) : Object.entries(current);
  for (const [key, value] of entries) {
    if (typeof value === "string" && value !== "") next.set(key, value);
  }
  if (!("limit" in patch)) next.delete("limit");
  next.delete("focus");
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Правка адреса для перехода на дату: поиск, «все предстоящие» и история
 * клиента снимаются — человек выбрал день, значит смотрит день.
 */
export function journalDatePatch(target: { view: JournalView; dateKey: string }, todayKey: string): JournalParamPatch {
  return {
    view: target.view === "day" ? null : target.view,
    date: target.dateKey === todayKey ? null : target.dateKey,
    q: null,
    upcoming: null,
    client: null,
  };
}

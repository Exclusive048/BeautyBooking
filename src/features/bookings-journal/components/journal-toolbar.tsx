"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { DateNavigator } from "@/features/schedule-nav/components/date-navigator";
import { BOOKING_STATUS_GROUP_IDS, type BookingStatusGroup } from "@/lib/bookings/status-groups";
import { cn } from "@/lib/cn";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import * as UI_TEXT from "@/lib/ui/text";
import { JOURNAL_SEARCH_MAX_LENGTH, journalDatePatch, type JournalView } from "../lib/journal-params";
import { useJournalNavigation } from "./use-journal-navigation";

const T = UI_TEXT.schedule.bookingsJournal;
/** Пауза ввода перед поиском: запрос уходит, когда человек перестал печатать. */
const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  view: JournalView;
  dateKey: string;
  todayKey: string;
  search: string;
  /** Что показано: день/неделя, все предстоящие (в том числе поиск) или история клиента. */
  mode: "date" | "upcoming" | "client";
  status: BookingStatusGroup | "all";
  searchPlaceholder: string;
  /** Мастера студии для фильтра; у кабинета мастера фильтра нет. */
  masters?: Array<{ id: string; name: string }>;
  masterId?: string;
  /** Пояс салона (salon-tz): время записей показывается в нём. */
  timeZone: string;
  /** Момент для подписи пояса (смещение зависит от даты). */
  zoneIso: string;
};

/**
 * BOOKINGS-JOURNAL — панель журнала записей: одна строка поиска, выбор дня
 * или недели (стрелки, «Сегодня», календарь на месяц), «Все предстоящие»
 * и фильтры.
 *
 * Поиск ищет без привязки к дате — по всем предстоящим записям (запрос
 * владельца 2026-10-31); выбранная дата остаётся в адресе, поэтому очистка
 * поиска возвращает к ней. Выбор даты поиск снимает: человек выбрал день,
 * значит смотрит день.
 */
export function JournalToolbar({
  view,
  dateKey,
  todayKey,
  search,
  mode,
  status,
  searchPlaceholder,
  masters,
  masterId = "all",
  timeZone,
  zoneIso,
}: Props) {
  const { update, pending } = useJournalNavigation();
  const viewerTimeZone = useViewerTimeZoneContext();
  const [draft, setDraft] = useState(search);
  // Черновик поиска следует за адресом (переход по дате снимает поиск,
  // «Назад» возвращает прежний), кроме эха собственной отправки — иначе
  // ответ сервера стирал бы буквы, набранные за время запроса (UX-PASS-01).
  const [seenSearch, setSeenSearch] = useState(search);
  const [sentSearch, setSentSearch] = useState(search);
  if (search !== seenSearch) {
    setSeenSearch(search);
    if (search !== sentSearch) {
      setSentSearch(search);
      setDraft(search);
    }
  }

  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === search) return;
    const timer = setTimeout(() => {
      setSentSearch(trimmed);
      update({ q: trimmed || null }, { history: "replace" });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, search, update]);

  const clearSearch = () => {
    setDraft("");
    setSentSearch("");
    update({ q: null }, { history: "replace" });
  };

  const showsAllUpcoming = mode === "upcoming" && !search;
  const toggleUpcoming = () => {
    if (showsAllUpcoming) update({ upcoming: null });
    else {
      setDraft("");
      setSentSearch("");
      update({ upcoming: "1", q: null, client: null });
    }
  };

  const zoneLabel = zonesDifferForViewer({ iso: zoneIso, salonTimeZone: timeZone, viewerTimeZone })
    ? formatZoneLabel({ iso: zoneIso, timeZone })
    : "";

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-3 sm:p-4">
      <div className="relative">
        {pending ? (
          <Loader2
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-sec"
            aria-hidden
          />
        ) : (
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
            aria-hidden
          />
        )}
        <Input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && draft) {
              event.preventDefault();
              clearSearch();
            }
          }}
          placeholder={searchPlaceholder}
          aria-label={T.searchAria}
          maxLength={JOURNAL_SEARCH_MAX_LENGTH}
          enterKeyHint="search"
          autoComplete="off"
          className="pl-9 pr-11"
          data-testid="bookings-journal-search"
        />
        {draft ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearSearch}
            aria-label={T.searchClear}
            title={T.searchClear}
            className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-text-sec"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <DateNavigator
        view={view}
        dateKey={dateKey}
        todayKey={todayKey}
        pending={pending}
        detached={mode !== "date"}
        labelTestId="bookings-journal-period"
        onNavigate={(target) => {
          setDraft("");
          setSentSearch("");
          update(journalDatePatch(target, todayKey));
        }}
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-pressed={showsAllUpcoming}
            onClick={toggleUpcoming}
            className={cn("rounded-lg", showsAllUpcoming && "border-primary/40 text-accent-text")}
            data-testid="bookings-journal-upcoming"
          >
            <CalendarRange className="h-4 w-4" aria-hidden />
            <span className="sm:hidden">{T.upcomingShort}</span>
            <span className="hidden sm:inline">{T.upcoming}</span>
          </Button>
        }
      />

      <div className={cn("grid gap-2", masters ? "sm:grid-cols-2" : "sm:max-w-xs")}>
        <Select
          value={status}
          aria-label={T.statusAria}
          onChange={(event) => update({ status: event.target.value === "all" ? null : event.target.value })}
          className="h-10"
        >
          <option value="all">{T.statusGroups.all}</option>
          {BOOKING_STATUS_GROUP_IDS.map((group) => (
            <option key={group} value={group}>
              {T.statusGroups[group]}
            </option>
          ))}
        </Select>
        {masters ? (
          <Select
            value={masterId}
            aria-label={T.masterAria}
            onChange={(event) => update({ master: event.target.value === "all" ? null : event.target.value })}
            className="h-10"
          >
            <option value="all">{T.masterAll}</option>
            {masters.map((master) => (
              <option key={master.id} value={master.id}>
                {master.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {zoneLabel ? (
        <p className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-input/50 px-2 py-0.5 text-2xs font-medium text-text-sec">
          {T.salonTimeNote} {zoneLabel}
        </p>
      ) : null}
    </div>
  );
}

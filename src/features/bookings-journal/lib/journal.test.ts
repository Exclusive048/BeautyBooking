import { describe, expect, it } from "vitest";
import { groupByDateKey } from "./group-by-date";
import {
  JOURNAL_MAX_LIMIT,
  JOURNAL_PAGE_SIZE,
  journalDatePatch,
  journalHref,
  parseJournalParams,
} from "./journal-params";
import { isJournalStatusInactive, journalStatusKey } from "./journal-status";
import { tokenizeJournalSearch } from "./search-tokens";

/**
 * BOOKINGS-JOURNAL — правила журнала записей (запрос владельца 2026-10-31):
 * по умолчанию — сегодняшний день салона, поиск — без привязки к дате по всем
 * предстоящим, записи — по дням.
 */

const TODAY = "2026-10-31"; // суббота

describe("parseJournalParams", () => {
  it("без параметров — сегодняшний день салона", () => {
    const state = parseJournalParams(undefined, TODAY);
    expect(state.mode).toBe("date");
    expect(state.view).toBe("day");
    expect(state.dateKey).toBe(TODAY);
    expect(state.window).toEqual({ fromKey: TODAY, toKeyExclusive: "2026-11-01" });
    expect(state.limit).toBe(JOURNAL_PAGE_SIZE);
    expect(state.status).toBe("all");
  });

  it("выбранная дата и неделя с понедельника", () => {
    expect(parseJournalParams({ date: "2026-11-05" }, TODAY).window).toEqual({
      fromKey: "2026-11-05",
      toKeyExclusive: "2026-11-06",
    });
    expect(parseJournalParams({ view: "week" }, TODAY).window).toEqual({
      fromKey: "2026-10-26",
      toKeyExclusive: "2026-11-02",
    });
  });

  it("поиск ищет по всем предстоящим без привязки к выбранной дате", () => {
    const state = parseJournalParams({ q: "  Анна  ", date: "2026-12-01" }, TODAY);
    expect(state.mode).toBe("upcoming");
    expect(state.search).toBe("Анна");
    expect(state.window).toEqual({ fromKey: TODAY, toKeyExclusive: null });
    // Дата остаётся в состоянии: очистили поиск — вернулись к ней.
    expect(state.dateKey).toBe("2026-12-01");
  });

  it("«все предстоящие» без поиска", () => {
    expect(parseJournalParams({ upcoming: "1" }, TODAY).window).toEqual({ fromKey: TODAY, toKeyExclusive: null });
  });

  it("битая дата, лимит и состояние — безопасные значения", () => {
    const state = parseJournalParams({ date: "2026-02-30", limit: "9999", status: "nope" }, TODAY);
    expect(state.dateKey).toBe(TODAY);
    expect(state.limit).toBe(JOURNAL_MAX_LIMIT);
    expect(state.status).toBe("all");
    expect(parseJournalParams({ limit: "-5" }, TODAY).limit).toBe(JOURNAL_PAGE_SIZE);
    expect(parseJournalParams({ status: "awaiting" }, TODAY).status).toBe("awaiting");
  });
});

describe("journalHref / journalDatePatch", () => {
  it("правка сбрасывает «Показать ещё» и подсветку, кроме самого limit", () => {
    const current = { date: "2026-11-05", limit: "100", focus: "b1", q: "Анна" };
    expect(journalHref("/x", current, { status: "awaiting" })).toBe("/x?date=2026-11-05&q=%D0%90%D0%BD%D0%BD%D0%B0&status=awaiting");
    expect(journalHref("/x", current, { limit: "150" })).toContain("limit=150");
  });

  it("переход на дату снимает поиск, «предстоящие» и историю клиента", () => {
    const patch = journalDatePatch({ view: "day", dateKey: "2026-11-05" }, TODAY);
    expect(journalHref("/x", { q: "Анна", upcoming: "1", client: "tok" }, patch)).toBe("/x?date=2026-11-05");
    // Сегодня — без даты в адресе.
    expect(journalHref("/x", { date: "2026-11-05" }, journalDatePatch({ view: "day", dateKey: TODAY }, TODAY))).toBe("/x");
  });
});

describe("tokenizeJournalSearch", () => {
  it("имя и фамилия — два слова, оба обязаны найтись", () => {
    expect(tokenizeJournalSearch("Анна Петрова")).toEqual([
      { kind: "text", value: "Анна" },
      { kind: "text", value: "Петрова" },
    ]);
  });

  it("номер с пробелами и скобками — одна цифровая строка, 8 → 7", () => {
    expect(tokenizeJournalSearch("8 (999) 123-45")).toEqual([{ kind: "digits", variants: ["899912345", "799912345"] }]);
  });

  it("пусто и повторы", () => {
    expect(tokenizeJournalSearch("   ")).toEqual([]);
    expect(tokenizeJournalSearch("анна Анна")).toHaveLength(1);
  });
});

describe("groupByDateKey", () => {
  it("группы в порядке первого появления, записи — по порядку", () => {
    const groups = groupByDateKey(["a1", "a2", "b1", "a3"], (item) => item.charAt(0));
    expect(groups).toEqual([
      { dateKey: "a", items: ["a1", "a2", "a3"] },
      { dateKey: "b", items: ["b1"] },
    ]);
  });
});

describe("journalStatusKey", () => {
  const start = new Date("2026-10-31T10:00:00Z");
  const end = new Date("2026-10-31T11:00:00Z");

  it("подтверждённая по времени: впереди → идёт → завершена", () => {
    const at = (iso: string) =>
      journalStatusKey({ status: "CONFIRMED", startAtUtc: start, endAtUtc: end, now: new Date(iso) });
    expect(at("2026-10-31T09:00:00Z")).toBe("CONFIRMED");
    expect(at("2026-10-31T10:30:00Z")).toBe("IN_PROGRESS");
    expect(at("2026-10-31T13:00:00Z")).toBe("FINISHED");
  });

  it("неподтверждённая остаётся «ждёт ответа», даже когда время прошло", () => {
    expect(
      journalStatusKey({ status: "PENDING", startAtUtc: start, endAtUtc: end, now: new Date("2026-11-01T00:00:00Z") }),
    ).toBe("PENDING");
  });

  it("отменённая и неявка приглушены", () => {
    const rejected = journalStatusKey({ status: "REJECTED", startAtUtc: start, endAtUtc: end, now: start });
    expect(rejected).toBe("CANCELLED");
    expect(isJournalStatusInactive(rejected)).toBe(true);
    expect(isJournalStatusInactive("NO_SHOW")).toBe(true);
    expect(isJournalStatusInactive("CONFIRMED")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { bookingsTimeRangeBounds } from "./time-range-filter";

/**
 * 29.09 доработки · 02 — чипы журнала студии режут сутки САЛОНА (salon-tz),
 * а не UTC. Якорь — Екатеринбург (GMT+5): в Москве ошибка почти не видна.
 *
 * @probe 2026-09-29 — «сегодня» снова по дате UTC (`now.toISOString().slice(0, 10)`
 * вместо `toLocalDateKey(now, timeZone)`): покраснел «Екатеринбург: 01:30 по
 * салону — уже новые сутки» (сутки 29-го вместо 30-го). Московский кейс в 12:00Z
 * при этом зелёный — там дата UTC совпадает с местной, поэтому якорь и нужен.
 * Возвращено — зелёный.
 */

const iso = (value: Date | null) => value?.toISOString() ?? null;

describe("bookingsTimeRangeBounds — сутки салона", () => {
  // 2026-09-29T20:30Z = 30 сентября, 01:30 в Екатеринбурге.
  const now = new Date("2026-09-29T20:30:00Z");

  it("Екатеринбург: 01:30 по салону — уже новые сутки", () => {
    const today = bookingsTimeRangeBounds("today", "Asia/Yekaterinburg", now);
    expect(iso(today.from)).toBe("2026-09-29T19:00:00.000Z");
    expect(iso(today.toExclusive)).toBe("2026-09-30T19:00:00.000Z");

    const tomorrow = bookingsTimeRangeBounds("tomorrow", "Asia/Yekaterinburg", now);
    expect(iso(tomorrow.from)).toBe("2026-09-30T19:00:00.000Z");
    expect(iso(tomorrow.toExclusive)).toBe("2026-10-01T19:00:00.000Z");

    const week = bookingsTimeRangeBounds("week", "Asia/Yekaterinburg", now);
    expect(iso(week.from)).toBe("2026-09-29T19:00:00.000Z");
    expect(iso(week.toExclusive)).toBe("2026-10-06T19:00:00.000Z");
  });

  it("Москва", () => {
    const today = bookingsTimeRangeBounds("today", "Europe/Moscow", new Date("2026-09-29T12:00:00Z"));
    expect(iso(today.from)).toBe("2026-09-28T21:00:00.000Z");
    expect(iso(today.toExclusive)).toBe("2026-09-29T21:00:00.000Z");
  });

  it("«Все» — без границ", () => {
    expect(bookingsTimeRangeBounds("all", "Asia/Yekaterinburg", now)).toEqual({
      from: null,
      toExclusive: null,
    });
  });
});

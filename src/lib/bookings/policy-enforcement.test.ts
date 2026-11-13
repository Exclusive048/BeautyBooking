import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  assertAcceptsNewClient,
  assertBookingWindow,
  clampToBookingWindow,
  earliestBookableUtc,
  isWithinBookableWindow,
  latestBookableUtc,
  publicBookingHorizonDays,
  stricterBookingWindow,
} from "./policy-enforcement";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";

const NOW = new Date("2026-05-20T10:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("policy-enforcement / earliestBookableUtc", () => {
  it("returns now + N hours", () => {
    expect(earliestBookableUtc({ minBookingHoursAhead: 2 }, NOW).toISOString()).toBe(
      hours(2).toISOString(),
    );
  });
  it("clamps negative N to 0", () => {
    expect(earliestBookableUtc({ minBookingHoursAhead: -5 }, NOW).getTime()).toBe(NOW.getTime());
  });
});

describe("policy-enforcement / latestBookableUtc", () => {
  it("returns now + N days", () => {
    expect(latestBookableUtc({ maxBookingDaysAhead: 30 }, NOW).toISOString()).toBe(
      days(30).toISOString(),
    );
  });
  it("clamps zero/negative to 1 day minimum", () => {
    expect(latestBookableUtc({ maxBookingDaysAhead: 0 }, NOW).toISOString()).toBe(
      days(1).toISOString(),
    );
  });
  it("SCHEDULE-PATTERNS-01: never past the schedule horizon (stored 365 from the old ceiling)", () => {
    expect(latestBookableUtc({ maxBookingDaysAhead: 365 }, NOW).toISOString()).toBe(
      days(SCHEDULE_HORIZON_DAYS).toISOString(),
    );
  });
});

describe("policy-enforcement / isWithinBookableWindow", () => {
  const policy = { minBookingHoursAhead: 2, maxBookingDaysAhead: 30 };
  it("accepts a slot inside the window", () => {
    expect(isWithinBookableWindow(hours(5), policy, NOW)).toBe(true);
  });
  it("rejects a slot before the earliest moment", () => {
    expect(isWithinBookableWindow(hours(1), policy, NOW)).toBe(false);
  });
  it("rejects a slot past the latest moment", () => {
    expect(isWithinBookableWindow(days(31), policy, NOW)).toBe(false);
  });
  it("accepts the boundary slots inclusively", () => {
    expect(isWithinBookableWindow(hours(2), policy, NOW)).toBe(true);
    expect(isWithinBookableWindow(days(30), policy, NOW)).toBe(true);
  });
});

describe("policy-enforcement / assertBookingWindow", () => {
  const policy = { minBookingHoursAhead: 2, maxBookingDaysAhead: 30 };
  it("passes silently for in-window times", () => {
    expect(() => assertBookingWindow(hours(5), policy, NOW)).not.toThrow();
  });
  it("throws BOOKING_TOO_SOON below earliest", () => {
    try {
      assertBookingWindow(hours(1), policy, NOW);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("BOOKING_TOO_SOON");
      expect((err as AppError).status).toBe(400);
    }
  });
  it("throws BOOKING_TOO_FAR above latest", () => {
    try {
      assertBookingWindow(days(31), policy, NOW);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("BOOKING_TOO_FAR");
      expect((err as AppError).status).toBe(400);
    }
  });
});

describe("policy-enforcement / assertAcceptsNewClient", () => {
  it("passes when acceptNewClients=true regardless of priors", () => {
    expect(() => assertAcceptsNewClient({ acceptNewClients: true }, 0)).not.toThrow();
    expect(() => assertAcceptsNewClient({ acceptNewClients: true }, 3)).not.toThrow();
  });
  it("passes when acceptNewClients=false but client has prior bookings", () => {
    expect(() => assertAcceptsNewClient({ acceptNewClients: false }, 1)).not.toThrow();
  });
  it("throws NEW_CLIENTS_CLOSED when acceptNewClients=false and no priors", () => {
    try {
      assertAcceptsNewClient({ acceptNewClients: false }, 0);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("NEW_CLIENTS_CLOSED");
      expect((err as AppError).status).toBe(403);
    }
  });
});

/**
 * BOOKING-WINDOW-MERGE (2026-11-14): выдача окошек обрезается по последнему
 * дню окна записи — дате последнего момента, на который запись ещё открыта
 * (`latestBookableUtc`), в поясе салона. Тот же день считают календарь выбора
 * даты (`bookable-days.ts`) и проверка записи (`assertBookingWindow`).
 *
 * @probe 2026-11-14 — дата ключа взята в UTC, а не в поясе салона: покраснел
 * «Екатеринбург ранним утром» (2026-05-27 вместо 2026-05-28). Без потолка
 * горизонта расписания (`now + n суток` вместо `latestBookableUtc`): покраснел
 * «не дальше горизонта расписания».
 */
describe("policy-enforcement / clampToBookingWindow", () => {
  it("без запрошенного конца — последний день окна записи", () => {
    // NOW = 2026-05-20 10:00Z, окно 7 суток → запись открыта до 2026-05-27 10:00.
    expect(clampToBookingWindow(null, { maxBookingDaysAhead: 7 }, NOW, "UTC")).toBe("2026-05-27");
  });
  it("запрошенный конец раньше окна — остаётся", () => {
    expect(clampToBookingWindow("2026-05-22", { maxBookingDaysAhead: 30 }, NOW, "UTC")).toBe("2026-05-22");
  });
  it("запрошенный конец за окном — обрезается", () => {
    expect(clampToBookingWindow("2026-12-31", { maxBookingDaysAhead: 7 }, NOW, "UTC")).toBe("2026-05-27");
  });
  it("окно не короче суток", () => {
    expect(clampToBookingWindow(null, { maxBookingDaysAhead: 0 }, NOW, "UTC")).toBe("2026-05-21");
  });
  it("не дальше горизонта расписания", () => {
    // 2026-05-20 + 92 суток = 2026-08-20.
    expect(SCHEDULE_HORIZON_DAYS).toBe(92);
    expect(clampToBookingWindow(null, { maxBookingDaysAhead: 365 }, NOW, "UTC")).toBe("2026-08-20");
  });
  it("последний день — тот, на который ещё принимается запись", () => {
    const policy = { minBookingHoursAhead: 0, maxBookingDaysAhead: 7 };
    const lastKey = clampToBookingWindow(null, policy, NOW, "UTC");
    const lastMinute = new Date(latestBookableUtc(policy, NOW).getTime() - 60_000);
    expect(isWithinBookableWindow(lastMinute, policy, NOW)).toBe(true);
    expect(lastMinute.toISOString().slice(0, 10)).toBe(lastKey);
  });

  // HARDENING-10 #16 — день считается в поясе САЛОНА. Поздний вечер по UTC —
  // раннее утро следующего дня восточнее UTC.
  const NOW_EVENING = new Date("2026-05-20T20:00:00Z"); // = 2026-05-21T01:00 в +5

  it("Екатеринбург ранним утром (GMT+5) — день по салону, не по UTC", () => {
    // 2026-05-27T20:00Z = 2026-05-28T01:00 по салону.
    expect(clampToBookingWindow(null, { maxBookingDaysAhead: 7 }, NOW_EVENING, "Asia/Yekaterinburg")).toBe(
      "2026-05-28",
    );
    expect(clampToBookingWindow(null, { maxBookingDaysAhead: 7 }, NOW_EVENING, "UTC")).toBe("2026-05-27");
  });

  it("Москва (GMT+3) в тот же момент — тот же день, что UTC", () => {
    // 2026-05-27T20:00Z = 2026-05-27T23:00 по салону.
    expect(clampToBookingWindow(null, { maxBookingDaysAhead: 7 }, NOW_EVENING, "Europe/Moscow")).toBe(
      "2026-05-27",
    );
  });
});

/**
 * BOOKING-WINDOW-STRICTER (решение владельца 2026-09-24): окно записи на услугу
 * студии — более строгое из окон студии и мастера.
 *
 * @probe 2026-09-24 — в `stricterBookingWindow` `Math.max` для минимума заменён
 * на `Math.min`: красный «больший минимум, меньший максимум».
 */
describe("stricterBookingWindow", () => {
  it("больший минимум, меньший максимум", () => {
    expect(
      stricterBookingWindow(
        { minBookingHoursAhead: 0, maxBookingDaysAhead: 90 },
        { minBookingHoursAhead: 2, maxBookingDaysAhead: 30 },
      ),
    ).toEqual({ minBookingHoursAhead: 2, maxBookingDaysAhead: 30 });
    expect(
      stricterBookingWindow(
        { minBookingHoursAhead: 6, maxBookingDaysAhead: 14 },
        { minBookingHoursAhead: 2, maxBookingDaysAhead: 30 },
      ),
    ).toEqual({ minBookingHoursAhead: 6, maxBookingDaysAhead: 14 });
  });

  it("без второго окна — первое как есть", () => {
    expect(stricterBookingWindow({ minBookingHoursAhead: 3, maxBookingDaysAhead: 20 }, null)).toEqual({
      minBookingHoursAhead: 3,
      maxBookingDaysAhead: 20,
    });
  });
});

/**
 * 29.09 доработки · 03 → BOOKING-WINDOW-MERGE — на сколько дней вперёд открыта
 * запись: окно записи, не дальше горизонта расписания (отдельного «Сколько
 * окошек вперёд» больше нет).
 */
describe("publicBookingHorizonDays", () => {
  it("окно записи, не дальше горизонта расписания", () => {
    expect(publicBookingHorizonDays({ maxBookingDaysAhead: 14 })).toBe(14);
    expect(publicBookingHorizonDays({ maxBookingDaysAhead: 90 })).toBe(90);
    expect(publicBookingHorizonDays({ maxBookingDaysAhead: 365 })).toBe(SCHEDULE_HORIZON_DAYS);
  });

  it("не меньше одного дня", () => {
    expect(publicBookingHorizonDays({ maxBookingDaysAhead: 0 })).toBe(1);
  });
});

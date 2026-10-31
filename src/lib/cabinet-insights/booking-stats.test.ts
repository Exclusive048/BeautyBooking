import { describe, expect, it } from "vitest";
import { computeBookingStats, type InsightBookingRow } from "./booking-stats";

/**
 * AI-CABINET-ANALYSIS — статистика записей для советов и ИИ-разбора. Пояс —
 * салона (rule 17): Екатеринбург (+5) выбран намеренно, чтобы UTC-счёт дал
 * другой день недели и другое время суток.
 */

const TZ = "Asia/Yekaterinburg";
const NOW = new Date("2026-11-01T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function row(overrides: Partial<InsightBookingRow> & { startAtUtc: Date }): InsightBookingRow {
  const start = overrides.startAtUtc;
  return {
    status: "FINISHED",
    cancelledBy: null,
    source: "WEB",
    createdAt: new Date(start.getTime() - 3 * DAY),
    endAtUtc: new Date(start.getTime() + HOUR),
    clientKey: "user:a",
    serviceId: "svc-1",
    masterProviderId: "m-1",
    ...overrides,
  };
}

describe("computeBookingStats", () => {
  it("делит прошедшие записи по исходу", () => {
    const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);
    const stats = computeBookingStats(
      [
        row({ startAtUtc: at(1) }),
        row({ startAtUtc: at(2), status: "CONFIRMED" }),
        row({ startAtUtc: at(3), status: "REJECTED", cancelledBy: "CLIENT" }),
        row({ startAtUtc: at(4), status: "REJECTED", cancelledBy: "PROVIDER" }),
        row({ startAtUtc: at(5), status: "REJECTED", cancelledBy: "SYSTEM" }),
        row({ startAtUtc: at(6), status: "NO_SHOW" }),
        // За окном истории — не считается.
        row({ startAtUtc: at(120) }),
      ],
      { now: NOW, timeZone: TZ },
    );
    expect(stats.facts).toMatchObject({
      past: 6,
      completed: 2,
      cancelledByClient: 1,
      cancelledByProvider: 1,
      expiredUnconfirmed: 1,
      noShow: 1,
    });
    // Отменённые в счёт записей на услугу не идут.
    expect(stats.bookingsByService.get("svc-1")).toBe(3);
  });

  it("день недели и время суток — по часам салона, а не UTC", () => {
    // 2026-10-25 21:00 UTC = 26 октября, понедельник, 02:00 в Екатеринбурге.
    const start = new Date("2026-10-25T21:00:00.000Z");
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ startAtUtc: new Date(start.getTime() - i * 7 * DAY), clientKey: `user:${i}` }),
    );
    const stats = computeBookingStats(rows, { now: NOW, timeZone: TZ });
    expect(stats.facts.busiestWeekdays).toEqual([1]);
    expect(stats.facts.timeOfDay).toEqual({ morning: 10, day: 0, evening: 0 });
  });

  it("на малой выборке доли не считаются", () => {
    const stats = computeBookingStats([row({ startAtUtc: new Date(NOW.getTime() - DAY) })], {
      now: NOW,
      timeZone: TZ,
    });
    expect(stats.facts.onlineShare).toBeNull();
    expect(stats.facts.avgLeadHours).toBeNull();
    expect(stats.facts.lastMinuteShare).toBeNull();
    expect(stats.facts.busiestWeekdays).toEqual([]);
  });

  it("повторные клиенты и загрузка впереди", () => {
    const past = (daysAgo: number, clientKey: string) =>
      row({ startAtUtc: new Date(NOW.getTime() - daysAgo * DAY), clientKey });
    const stats = computeBookingStats(
      [
        past(1, "user:a"),
        past(10, "user:a"),
        past(2, "phone:+79990000001"),
        row({ startAtUtc: new Date(NOW.getTime() + DAY), status: "CONFIRMED", masterProviderId: "m-2" }),
        // Отменённая будущая запись время не занимает.
        row({ startAtUtc: new Date(NOW.getTime() + 2 * DAY), status: "REJECTED", cancelledBy: "CLIENT" }),
      ],
      { now: NOW, timeZone: TZ },
    );
    expect(stats.facts.uniqueClients).toBe(2);
    expect(stats.facts.returningClients).toBe(1);
    expect(stats.facts.upcoming).toBe(1);
    expect(stats.bookedMinutesAhead).toBe(60);
    expect(stats.bookedMinutesAheadByMaster.get("m-2")).toBe(60);
  });
});

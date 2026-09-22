import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-26 — проход cron'а по приглашениям оставить отзыв читал снапшот брони
 * ВНУТРИ цикла: `findUnique` + рассылка на каждого кандидата, то есть до 400
 * последовательных round-trip'ов при `take: 200`.
 *
 * Тест сторожит две вещи разом, и вторая важнее первой:
 *   1) стоимость чтения не растёт с числом кандидатов (один batch-запрос);
 *   2) рассылка по-прежнему изолирована по элементу — падение одного
 *      получателя не срывает проход. Батчинг чтения соблазняет заодно
 *      «упростить» цикл до `Promise.all`, а это и потеря изоляции, и
 *      параллельная нагрузка на push-канал.
 */

const bookingFindMany = vi.hoisted(() => vi.fn());
const notificationFindMany = vi.hoisted(() => vi.fn());
const bookingFindUnique = vi.hoisted(() => vi.fn());
const loadBookingsWithRelations = vi.hoisted(() => vi.fn());
const notifyBookingCompletedReview = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: bookingFindMany, findUnique: bookingFindUnique },
    notification: { findMany: notificationFindMany },
  },
}));

vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingsWithRelations,
  notifyBookingCompletedReview,
}));

vi.mock("@/lib/logging/logger", () => ({ logError, logInfo: vi.fn() }));

import { runBookingReviewPromptJob } from "@/lib/bookings/review-prompts";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `bk_${i}`);

function arrange(candidateIds: string[], notified: string[] = []) {
  bookingFindMany.mockResolvedValue(candidateIds.map((id) => ({ id })));
  notificationFindMany.mockResolvedValue(notified.map((bookingId) => ({ bookingId })));
  loadBookingsWithRelations.mockImplementation(async (wanted: string[]) =>
    new Map(wanted.map((id) => [id, { id }]))
  );
}

describe("PERF-26 · проход не читает снапшоты поштучно", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("двести кандидатов — одно чтение снапшотов, а не двести", async () => {
    arrange(ids(200));

    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    expect(loadBookingsWithRelations).toHaveBeenCalledTimes(1);
    expect(loadBookingsWithRelations.mock.calls[0][0]).toHaveLength(200);
    // Поштучная читалка на этом пути не должна вызываться вовсе.
    expect(bookingFindUnique).not.toHaveBeenCalled();
    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(200);
  });

  it("уже приглашённые не попадают ни в чтение, ни в рассылку", async () => {
    arrange(ids(5), ["bk_1", "bk_3"]);

    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    expect(loadBookingsWithRelations.mock.calls[0][0]).toEqual(["bk_0", "bk_2", "bk_4"]);
    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(3);
  });

  it("падение одного получателя не срывает проход", async () => {
    arrange(ids(3));
    notifyBookingCompletedReview.mockImplementation(async (booking: { id: string }) => {
      if (booking.id === "bk_1") throw new Error("push недоступен");
    });

    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][1]).toMatchObject({ bookingId: "bk_1" });
  });

  it("исчезнувшая между запросами бронь просто пропускается", async () => {
    arrange(ids(3));
    loadBookingsWithRelations.mockResolvedValue(new Map([["bk_0", { id: "bk_0" }]]));

    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("пустой набор кандидатов не идёт ни за снапшотами, ни за уведомлениями", async () => {
    arrange([]);

    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    expect(notificationFindMany).not.toHaveBeenCalled();
    expect(loadBookingsWithRelations).not.toHaveBeenCalled();
  });
});

/**
 * REVIEW-PROMPT-01 — запрос отзыва уходит тогда, когда отзыв уже можно оставить,
 * по всем незакрытым статусам и один раз на пакет.
 *
 * @probe 2026-09-22 — `readyBefore` заменён на `now` (прежняя форма): красным
 * стал «не раньше открытия окна отзыва» (`lte` = 10:00 вместо 09:00). Фильтр
 * статуса, возвращённый к `status: "CONFIRMED"`, красит кейс статусов; отбор
 * пакета без `dropNonFinalPackageComponents` красит кейс пакета.
 */
describe("REVIEW-PROMPT-01 · когда и кому уходит запрос отзыва", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("не раньше открытия окна отзыва (конец визита + 60 минут)", async () => {
    arrange([]);
    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    const where = bookingFindMany.mock.calls[0][0].where;
    expect(where.endAtUtc.lte).toEqual(new Date("2026-08-06T09:00:00Z"));
  });

  it("берёт любой незакрытый статус, а не только CONFIRMED", async () => {
    arrange([]);
    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    const where = bookingFindMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] });
  });

  it("пакет получает один запрос — по последней услуге", async () => {
    bookingFindMany
      .mockResolvedValueOnce([
        { id: "p1", bookingPackageId: "pkg", endAtUtc: new Date("2026-08-06T07:00:00Z") },
        { id: "p2", bookingPackageId: "pkg", endAtUtc: new Date("2026-08-06T08:00:00Z") },
        { id: "solo", bookingPackageId: null, endAtUtc: new Date("2026-08-06T08:00:00Z") },
      ])
      .mockResolvedValueOnce([
        { id: "p1", bookingPackageId: "pkg", endAtUtc: new Date("2026-08-06T07:00:00Z") },
        { id: "p2", bookingPackageId: "pkg", endAtUtc: new Date("2026-08-06T08:00:00Z") },
      ]);
    notificationFindMany.mockResolvedValue([]);
    loadBookingsWithRelations.mockImplementation(async (wanted: string[]) =>
      new Map(wanted.map((id) => [id, { id }]))
    );

    await runBookingReviewPromptJob(new Date("2026-08-06T10:00:00Z"));

    const notified = notifyBookingCompletedReview.mock.calls.map((call) => call[0].id).sort();
    expect(notified).toEqual(["p2", "solo"]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 00-12 — запись для кнопки «Оставить отзыв» на публичной
 * странице ищется одним запросом и тем же правилом окна, что `can-leave`.
 *
 * @probe 2026-09-29 — из `where` убрано `review: { is: null }`: покраснел «ищет
 * только записи клиента у этого провайдера без отзыва, в окне отзыва». Возвращено — зелёный.
 */

const bookingFindMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findMany: bookingFindMany } } }));

import { findReviewableBookingId } from "./service";

const NOW = new Date("2026-09-29T12:00:00Z");

function booking(id: string, startIso: string, status = "CONFIRMED") {
  return {
    id,
    clientUserId: "client-1",
    status,
    startAtUtc: new Date(startIso),
    endAtUtc: new Date(new Date(startIso).getTime() + 60 * 60 * 1000),
    service: { durationMin: 60 },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("findReviewableBookingId", () => {
  it("ищет только записи клиента у этого провайдера без отзыва, в окне отзыва", async () => {
    bookingFindMany.mockResolvedValue([]);
    await findReviewableBookingId({ currentUserId: "client-1", providerId: "prov-1", nowUtc: NOW });

    const where = bookingFindMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      clientUserId: "client-1",
      providerId: "prov-1",
      review: { is: null },
      startAtUtc: { lte: NOW },
    });
  });

  it("возвращает первую запись, на которую уже можно оставить отзыв", async () => {
    bookingFindMany.mockResolvedValue([
      // идёт сейчас — окно отзыва ещё не открылось
      booking("in-progress", "2026-09-29T11:30:00Z"),
      booking("cancelled", "2026-09-28T09:00:00Z", "CANCELLED"),
      booking("finished", "2026-09-28T08:00:00Z"),
    ]);
    const id = await findReviewableBookingId({
      currentUserId: "client-1",
      providerId: "prov-1",
      nowUtc: NOW,
    });
    expect(id).toBe("finished");
  });

  it("нет подходящей записи — null", async () => {
    bookingFindMany.mockResolvedValue([booking("in-progress", "2026-09-29T11:30:00Z")]);
    const id = await findReviewableBookingId({
      currentUserId: "client-1",
      providerId: "prov-1",
      nowUtc: NOW,
    });
    expect(id).toBeNull();
  });
});

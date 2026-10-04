import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (G7) — `loadStudioReviewsSet` / `loadStudioReviewsList`:
 * `canReply` считается по цели отзыва (правило сервера), а не «администратору
 * — всё»; фильтры и счётчики — по всему набору; веб-список режет страницу
 * курсором-id, как раньше.
 */

const studioFindUnique = vi.hoisted(() => vi.fn());
const membershipFindFirst = vi.hoisted(() => vi.fn());
const providerFindFirst = vi.hoisted(() => vi.fn());
const providerFindMany = vi.hoisted(() => vi.fn());
const reviewFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    studioMembership: { findFirst: membershipFindFirst },
    provider: { findFirst: providerFindFirst, findMany: providerFindMany },
    review: { findMany: reviewFindMany },
  },
}));

import { loadStudioReviewsList, loadStudioReviewsSet } from "./reviews-data.service";

function review(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    rating: 5,
    text: "Спасибо!",
    replyText: null,
    repliedAt: null,
    reportedAt: null,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    masterId: "prov-m1",
    bookingId: null,
    targetType: "provider",
    targetId: "prov-m1",
    author: { displayName: "Мария", firstName: null, lastName: null },
    master: { id: "prov-m1", name: "Анна" },
    booking: { service: { name: "Маникюр", title: null } },
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  studioFindUnique.mockResolvedValue({ id: "studio-1", providerId: "prov-s1", ownerUserId: "owner-1" });
  reviewFindMany.mockResolvedValue([
    review("r-studio", { targetType: "studio", targetId: "prov-s1", masterId: null, master: null }),
    review("r-master", { rating: 2 }),
    review("r-left", { targetId: "prov-left", masterId: "prov-left", master: { id: "prov-left", name: "Ушла" } }),
    review("r-replied", { replyText: "Спасибо вам!", repliedAt: new Date("2026-10-01T13:00:00Z") }),
  ]);
  providerFindMany.mockImplementation(async (args: { where: { id?: unknown } }) => {
    if (args.where.id) {
      return [
        { id: "prov-m1", type: "MASTER", ownerUserId: "user-m1", studioId: "prov-s1", masterProfile: null },
        { id: "prov-left", type: "MASTER", ownerUserId: "user-left", studioId: null, masterProfile: null },
      ];
    }
    return [{ id: "prov-m1", name: "Анна" }];
  });
});

describe("loadStudioReviewsSet — canReply по правилу сервера", () => {
  it("владелец: отзыв на студию и на мастера студии — да, на ушедшего мастера — нет", async () => {
    const set = await loadStudioReviewsSet({ studioId: "studio-1", currentUserId: "owner-1", filter: "all" });
    const canReply = Object.fromEntries(set.items.map((item) => [item.id, item.canReply]));
    expect(canReply).toEqual({ "r-studio": true, "r-master": true, "r-left": false, "r-replied": true });
    expect(set.filterCounts).toEqual({ all: 4, no_reply: 3, low_rating: 1, five_star: 3 });
    expect(set.totalReviewsCount).toBe(4);
    expect(set.unansweredCount).toBe(3);
    expect(set.masterOptions).toEqual([{ id: "prov-m1", displayName: "Анна" }]);
  });

  it("мастер студии: только отзывы на свой профиль", async () => {
    studioFindUnique.mockResolvedValue({ id: "studio-1", providerId: "prov-s1", ownerUserId: "owner-1" });
    membershipFindFirst.mockResolvedValue({ roles: ["MASTER"] });
    providerFindFirst.mockResolvedValue({ id: "prov-m1" });

    const set = await loadStudioReviewsSet({ studioId: "studio-1", currentUserId: "user-m1", filter: "all" });
    const canReply = Object.fromEntries(set.items.map((item) => [item.id, item.canReply]));
    expect(canReply).toEqual({ "r-studio": false, "r-master": true, "r-left": false, "r-replied": true });
  });

  it("фильтр и мастер сужают набор, счётчики — по всему", async () => {
    const set = await loadStudioReviewsSet({
      studioId: "studio-1",
      currentUserId: "owner-1",
      filter: "no_reply",
      masterId: "prov-m1",
    });
    expect(set.items.map((item) => item.id)).toEqual(["r-master"]);
    expect(set.filterCounts.all).toBe(4);
  });
});

describe("loadStudioReviewsSet — bookingId (MOBILE-POLISH)", () => {
  it("id записи — только у записи этой студии", async () => {
    reviewFindMany.mockResolvedValue([
      review("r-own", { bookingId: "b-own", booking: { studioId: "studio-1", service: { name: "Маникюр", title: null } } }),
      review("r-personal", { bookingId: "b-personal", booking: { studioId: null, service: null } }),
      review("r-other", { bookingId: "b-other", booking: { studioId: "studio-2", service: null } }),
      review("r-none", { bookingId: null, booking: null }),
    ]);
    const set = await loadStudioReviewsSet({ studioId: "studio-1", currentUserId: "owner-1", filter: "all" });
    expect(Object.fromEntries(set.items.map((item) => [item.id, item.bookingId]))).toEqual({
      "r-own": "b-own",
      "r-personal": null,
      "r-other": null,
      "r-none": null,
    });
    const select = reviewFindMany.mock.calls[0]?.[0]?.select;
    expect(select.booking.select.studioId).toBe(true);
  });
});

describe("loadStudioReviewsList — веб без изменений", () => {
  it("страница режется курсором-id после общего набора", async () => {
    const list = await loadStudioReviewsList({
      studioId: "studio-1",
      currentUserId: "owner-1",
      filter: "all",
      cursor: "r-master",
    });
    expect(list.items.map((item) => item.id)).toEqual(["r-left", "r-replied"]);
    expect(list.nextCursor).toBeNull();
    expect(list.items[0]).toHaveProperty("dateLabel");
  });
});

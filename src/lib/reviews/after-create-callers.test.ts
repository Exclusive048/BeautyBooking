import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 05 — оба пути создания отзыва (клиент с сессией и гость по
 * ссылке) зовут общий `afterReviewCreated`: уведомление стороне провайдера и
 * сброс AI-сводки. Проверяется поведением роутов, а не текстом исходника.
 *
 * @probe 2026-09-29 — из гостевого роута убран вызов `afterReviewCreated`:
 * покраснел «гость по ссылке — уведомление и сброс сводки». Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  afterReviewCreated: vi.fn(async () => undefined),
  createReview: vi.fn(),
  createGuestReview: vi.fn(),
  resolveGuestManageScope: vi.fn(),
}));

vi.mock("@/lib/reviews/after-create", () => ({ afterReviewCreated: mocks.afterReviewCreated }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn(async () => ({ id: "client-1" })) }));
vi.mock("@/lib/reviews/service", () => ({ createReview: mocks.createReview, listReviews: vi.fn() }));
vi.mock("@/lib/bookings/guest-manage", () => ({
  createGuestReview: mocks.createGuestReview,
  resolveGuestManageScope: mocks.resolveGuestManageScope,
}));
vi.mock("@/lib/bookings/guest-manage-route", () => ({ guestManageRateLimitRefusal: vi.fn(async () => null) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), getRequestId: () => "req" }));

import { AppError } from "@/lib/api/errors";
import { POST as clientPost } from "@/app/api/reviews/route";
import { POST as guestPost } from "@/app/api/public/bookings/manage/[token]/review/route";

const BODY = { bookingId: "b1", rating: 5, publicTagIds: [], privateTagIds: [] };
const REVIEW = { id: "e_r1", targetId: "p1" };

function request(url: string) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(BODY),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createReview.mockResolvedValue(REVIEW);
  mocks.createGuestReview.mockResolvedValue(REVIEW);
  mocks.resolveGuestManageScope.mockResolvedValue({ bookingId: "b1", clientUserId: "g1", bookingPackageId: null, bookingIds: ["b1"] });
});

describe("afterReviewCreated — оба пути", () => {
  it("клиент с сессией — уведомление и сброс сводки", async () => {
    const res = await clientPost(request("http://localhost/api/reviews"));
    expect(res.status).toBe(201);
    expect(mocks.afterReviewCreated).toHaveBeenCalledWith(REVIEW, expect.objectContaining({ route: "POST /api/reviews" }));
  });

  it("гость по ссылке — уведомление и сброс сводки", async () => {
    const res = await guestPost(request("http://localhost/api/public/bookings/manage/tok/review"), {
      params: Promise.resolve({ token: "tok" }),
    });
    expect(res.status).toBe(201);
    expect(mocks.afterReviewCreated).toHaveBeenCalledWith(REVIEW, expect.objectContaining({ route: expect.stringContaining("manage") }));
  });

  it("запись стала аккаунтной — 403, отзыв не создаётся", async () => {
    mocks.resolveGuestManageScope.mockRejectedValue(
      new AppError("Эта запись привязана к аккаунту. Войдите, чтобы управлять ею.", 403, "GUEST_MANAGE_ACCOUNT_REQUIRED"),
    );
    const res = await guestPost(request("http://localhost/api/public/bookings/manage/tok/review"), {
      params: Promise.resolve({ token: "tok" }),
    });
    expect(res.status).toBe(403);
    expect(mocks.createGuestReview).not.toHaveBeenCalled();
    expect(mocks.afterReviewCreated).not.toHaveBeenCalled();
  });
});

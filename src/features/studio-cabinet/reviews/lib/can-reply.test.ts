import { describe, expect, it } from "vitest";
import { canReplyToStudioReview, type ReviewReplyTargetProvider } from "./can-reply";

/**
 * MOBILE-STUDIO-C (G7) — `canReply` кабинета студии повторяет правило сервера
 * `ensureMasterReviewAccess`: кнопка «Ответить» не обещает того, что ответ
 * отвергнет 403.
 */

const ADMIN = { userId: "admin-1", isStudioAdmin: true, studioProviderId: "prov-s1" };
const MASTER_VIEWER = { userId: "user-m1", isStudioAdmin: false, studioProviderId: "prov-s1" };

const master = (patch: Partial<ReviewReplyTargetProvider> = {}): ReviewReplyTargetProvider => ({
  type: "MASTER",
  ownerUserId: "user-m1",
  masterProfileUserId: null,
  studioId: "prov-s1",
  ...patch,
});

describe("canReplyToStudioReview", () => {
  it("отзыв на эту студию — администратору да, мастеру нет", () => {
    const review = { targetType: "studio", targetId: "prov-s1" };
    expect(canReplyToStudioReview({ review, targetProvider: null, viewer: ADMIN })).toBe(true);
    expect(canReplyToStudioReview({ review, targetProvider: null, viewer: MASTER_VIEWER })).toBe(false);
  });

  it("отзыв на другую студию — нет", () => {
    expect(
      canReplyToStudioReview({ review: { targetType: "studio", targetId: "prov-s2" }, targetProvider: null, viewer: ADMIN }),
    ).toBe(false);
  });

  it("отзыв на мастера этой студии — администратору и самому мастеру", () => {
    const review = { targetType: "provider", targetId: "prov-m1" };
    expect(canReplyToStudioReview({ review, targetProvider: master(), viewer: ADMIN })).toBe(true);
    expect(canReplyToStudioReview({ review, targetProvider: master(), viewer: MASTER_VIEWER })).toBe(true);
  });

  it("мастер через masterProfile — да", () => {
    const review = { targetType: "provider", targetId: "prov-m1" };
    const viewer = { ...MASTER_VIEWER, userId: "user-mp" };
    expect(
      canReplyToStudioReview({
        review,
        targetProvider: master({ ownerUserId: null, masterProfileUserId: "user-mp" }),
        viewer,
      }),
    ).toBe(true);
  });

  it("мастер ушёл из студии — администратору нет (раньше было «да всем»)", () => {
    const review = { targetType: "provider", targetId: "prov-m1" };
    expect(canReplyToStudioReview({ review, targetProvider: master({ studioId: "prov-s2" }), viewer: ADMIN })).toBe(false);
    expect(canReplyToStudioReview({ review, targetProvider: master({ studioId: null }), viewer: ADMIN })).toBe(false);
  });

  it("чужой мастер — мастеру студии нет", () => {
    const review = { targetType: "provider", targetId: "prov-m2" };
    expect(
      canReplyToStudioReview({ review, targetProvider: master({ ownerUserId: "user-m2" }), viewer: MASTER_VIEWER }),
    ).toBe(false);
  });

  it("цель не найдена, не мастер или незнакомый тип — нет", () => {
    const review = { targetType: "provider", targetId: "prov-x" };
    expect(canReplyToStudioReview({ review, targetProvider: null, viewer: ADMIN })).toBe(false);
    expect(canReplyToStudioReview({ review, targetProvider: master({ type: "STUDIO" }), viewer: ADMIN })).toBe(false);
    expect(
      canReplyToStudioReview({ review: { targetType: "other", targetId: "x" }, targetProvider: null, viewer: ADMIN }),
    ).toBe(false);
  });
});

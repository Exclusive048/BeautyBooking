/**
 * MOBILE-STUDIO-C (G7) — может ли зритель кабинета студии ответить на отзыв
 * (или поправить ответ). Повторяет правило сервера
 * `ensureMasterReviewAccess` (`lib/reviews/service.ts`), чтобы кнопка «Ответить»
 * не обещала то, что `POST /api/reviews/{id}/reply` отвергнет 403:
 *
 *  - отзыв на студию (`targetType = studio`) — владелец / администратор этой
 *    студии (`targetId` — Provider студии);
 *  - отзыв на мастера (`targetType = provider`) — сам мастер (владелец
 *    профиля или его `masterProfile`) либо владелец / администратор студии,
 *    к которой мастер привязан;
 *  - прочие цели — никто.
 *
 * Раньше кабинет студии считал `canReply = true` для всех отзывов у
 * администратора (в том числе на мастера, ушедшего из студии) и сверял
 * мастера по `Review.masterId`, а не по цели отзыва.
 */

export type ReviewReplyTargetProvider = {
  type: string;
  ownerUserId: string | null;
  masterProfileUserId: string | null;
  /** Provider студии, к которой привязан мастер. */
  studioId: string | null;
};

export function canReplyToStudioReview(input: {
  review: { targetType: string; targetId: string };
  /** Provider цели — только для `targetType = provider`; `null` — не найден. */
  targetProvider: ReviewReplyTargetProvider | null;
  viewer: { userId: string; isStudioAdmin: boolean; studioProviderId: string };
}): boolean {
  const { review, targetProvider, viewer } = input;
  if (review.targetType === "studio") {
    return viewer.isStudioAdmin && review.targetId === viewer.studioProviderId;
  }
  if (review.targetType !== "provider") return false;
  if (!targetProvider || targetProvider.type !== "MASTER") return false;
  if (targetProvider.ownerUserId === viewer.userId) return true;
  if (targetProvider.masterProfileUserId === viewer.userId) return true;
  return viewer.isStudioAdmin && targetProvider.studioId === viewer.studioProviderId;
}

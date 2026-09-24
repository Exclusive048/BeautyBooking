import type { Prisma, ReviewTargetType } from "@prisma/client";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

/**
 * STUDIO-REVIEW-MASTER-RATING (2026-09-24, решение владельца) — какие отзывы
 * относятся к цели: одно правило для рейтинга (`recalculate-ratings.ts`) и для
 * списка отзывов (`listReviews` — публичная страница мастера и его кабинет).
 *
 * Отзыв о визите в студию (`targetType: "studio"`) засчитывается студии И
 * мастеру, который оказывал услугу (`Review.masterId`, STUDIO-REVIEWS-SCOPE-01).
 * Раньше мастер студии копил рейтинг только с личной страницы: его работа в
 * студии, ради которой к нему и идут, в его карточке не отражалась. Строка
 * отзыва одна — цель по-прежнему студия, а мастер «видит» её через `masterId`.
 * Правило читать только отсюда: разойдись список и рейтинг, карточка показывала
 * бы «4.9 · 12 отзывов», а под ней — восемь.
 */
export function targetReviewsWhere(targetType: ReviewTargetType, targetId: string): Prisma.ReviewWhereInput {
  if (targetType === "provider") {
    return {
      ...ACTIVE_REVIEW_FILTER,
      OR: [
        { targetType: "provider", targetId },
        { targetType: "studio", masterId: targetId },
      ],
    };
  }
  return { targetType, targetId, ...ACTIVE_REVIEW_FILTER };
}

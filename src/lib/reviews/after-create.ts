import "server-only";
import { invalidateReviewSummaryCache } from "@/lib/ai/review-summary";
import { logError } from "@/lib/logging/logger";
import { loadReviewWithRelations, notifyReviewLeft } from "@/lib/notifications/review-notifications";
import { decodePublicId } from "@/lib/public-id";
import type { ReviewDto } from "@/lib/reviews/types";

/**
 * Побочные эффекты нового отзыва — уведомление стороне провайдера и сброс
 * AI-сводки отзывов. 29.09 доработки · 05: вынесено из `POST /api/reviews`,
 * потому что отзыв теперь создаёт и гость по ссылке «Управлять записью»
 * (`POST /api/public/bookings/manage/[token]/review`) — без общего места у
 * второго пути молча не было бы ни уведомления мастеру, ни сброса сводки.
 *
 * Отказы не выходят наружу: отзыв уже записан, и ответ клиенту не должен от
 * них зависеть.
 */
export async function afterReviewCreated(review: ReviewDto, context: { requestId?: string | null; route: string }): Promise<void> {
  try {
    // R2-06-E (FIX-18 tail): `review.id` из createReview — непрозрачный
    // публичный токен; для сырого поиска его нужно декодировать.
    const fullReview = await loadReviewWithRelations(decodePublicId(review.id));
    if (fullReview) await notifyReviewLeft(fullReview);
  } catch (error) {
    logError(`${context.route} notification failed`, {
      requestId: context.requestId ?? undefined,
      route: context.route,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
  void invalidateReviewSummaryCache(review.targetId);
}

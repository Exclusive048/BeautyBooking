import type { Prisma } from "@prisma/client";

/**
 * STUDIO-REVIEWS-SCOPE-01 — «отзывы этой студии» для кабинета студии.
 *
 * Кабинет отбирал отзывы только по `Review.studioId`, а `createReview` это поле
 * до STUDIO-REVIEWS-SCOPE-01 не заполнял: отзыв на визит в студию пишется с
 * целью `studio` (`targetId` = `Provider.id` студии) — он виден на публичной
 * странице и в рейтинге студии, но не владельцу. Новые отзывы несут
 * `studioId`; вторая ветка условия покрывает уже написанные без миграции.
 * Единственное место условия — дашборд, страница отзывов, их статистика и бейдж
 * сайдбара обязаны считать одно и то же множество.
 */
export function studioReviewsWhere(studio: { id: string; providerId: string }): Prisma.ReviewWhereInput {
  return {
    OR: [{ studioId: studio.id }, { targetType: "studio", targetId: studio.providerId }],
  };
}

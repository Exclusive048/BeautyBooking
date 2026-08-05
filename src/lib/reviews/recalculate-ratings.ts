import "server-only";
import { Prisma, type ReviewTargetType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

/**
 * LOGIC-16 — пересчёт рейтинга цели отзыва. ЕДИНСТВЕННЫЙ писатель
 * `Provider.ratingAvg`/`ratingCount` (+ legacy-зеркала `rating`/`reviews`) и
 * `Studio.ratingAvg`/`ratingCount`.
 *
 * **Почему блокировка строки, а не просто агрегат.** Пересчёт — это
 * read-modify-write: агрегат по всем активным отзывам цели, затем запись
 * результата в строку провайдера. Транзакции шли с изоляцией по умолчанию
 * (Read Committed), где транзакция B не видит незакоммиченный `review.create`
 * транзакции A, — то есть B считала `count = N+1` вместо `N+2` и записывала
 * это поверх результата A. Потеря обновления не самозалечивается: следующий
 * отзыв догонит счётчик, но до него публичный профиль показывает заниженное
 * число.
 *
 * `SELECT … FOR UPDATE` до агрегата решает это дешевле, чем Serializable с
 * ретраем: конкурентный пересчёт по той же цели блокируется на строке
 * провайдера, а после снятия блокировки его СЛЕДУЮЩИЙ оператор берёт свежий
 * снимок (семантика Read Committed — снимок на оператор) и видит
 * закоммиченный отзыв соперника. Ни абортов, ни ретраев, ни изменения
 * изоляции в четырёх местах.
 *
 * Порядок обязателен: блокировка → агрегат → запись. Блокировка ПОСЛЕ
 * агрегата (а именно так и работал `provider.update`, беря свой lock)
 * не даёт ничего — цифра к этому моменту уже посчитана по старому снимку.
 *
 * **Одиночный писатель.** До LOGIC-16 копий было три, и они разошлись:
 * админские глотали отказ записи голым `catch {}` и вовсе не трогали
 * `Studio` — то есть удаление отзыва студии админом оставляло рейтинг
 * студии протухшим. Блокировка в одной копии из трёх не серилизует ничего:
 * писатель, который её не берёт, затирает свободно. Отсюда и требование
 * одного писателя — оно тут не про стиль, а про корректность.
 * Пин — `reviews/recalculate-ratings.test.ts`.
 */
export async function recalculateTargetRatings(
  tx: Prisma.TransactionClient,
  targetType: ReviewTargetType,
  targetId: string
): Promise<void> {
  // Точка сериализации. Целью отзыва (`targetId`) всегда служит `Provider.id`
  // — в том числе для `targetType: "studio"` (см. поиск студии по
  // `providerId` ниже), поэтому блокировка одна на оба вида цели, и порядок
  // взятия блокировок разойтись не может.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Provider" WHERE id = ${targetId} FOR UPDATE`);

  // Soft-deleted reviews (REVIEW-SOFT-DELETE-A) are excluded from the
  // aggregate. The standard `deletedAt: null` filter applies here too —
  // a deleted review must not influence the target's public rating.
  const aggregate = await tx.review.aggregate({
    where: { targetType, targetId, ...ACTIVE_REVIEW_FILTER },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const ratingAvg = aggregate._avg.rating ?? 0;
  const ratingCount = aggregate._count._all ?? 0;

  await tx.provider.update({
    where: { id: targetId },
    data: {
      ratingAvg,
      ratingCount,
      rating: ratingAvg,
      reviews: ratingCount,
    },
  });

  if (targetType === "studio") {
    const studio = await tx.studio.findUnique({
      where: { providerId: targetId },
      select: { id: true },
    });
    if (!studio) {
      throw new AppError("Профиль для отзыва не найден.", 404, "REVIEW_TARGET_NOT_FOUND");
    }
    await tx.studio.update({
      where: { id: studio.id },
      data: { ratingAvg, ratingCount },
    });
  }
}

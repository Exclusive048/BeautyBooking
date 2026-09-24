// Без `import "server-only"` (STUDIO-REVIEW-MASTER-RATING): модуль получает
// клиент транзакции параметром и сам ни Prisma, ни Redis не импортирует, а зовёт
// его и пост-деплой (`studio-review-master-backfill.ts`), который идёт обычным
// `tsx` без условия `react-server`.
import { Prisma, type ReviewTargetType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { targetReviewsWhere } from "@/lib/reviews/review-scope";

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
export type RatingRecalcTarget = {
  targetType: ReviewTargetType;
  targetId: string;
  /**
   * Исполнитель визита (`Review.masterId`). Обязателен ТИПОМ: у отзыва о визите
   * в студию меняется и рейтинг мастера (STUDIO-REVIEW-MASTER-RATING), и
   * вызывающий, забывший его передать, не компилируется, а не оставляет
   * мастеру протухший рейтинг.
   */
  masterId: string | null;
};

export async function recalculateTargetRatings(
  tx: Prisma.TransactionClient,
  target: RatingRecalcTarget
): Promise<void> {
  await recalculateOneTarget(tx, target.targetType, target.targetId);
  // STUDIO-REVIEW-MASTER-RATING: визит в студию — оценка и мастеру-исполнителю.
  // Порядок блокировок фиксирован (студия → мастер), а обратного пути нет:
  // пересчёт мастера никогда не берёт строку студии.
  if (target.targetType === "studio" && target.masterId && target.masterId !== target.targetId) {
    await recalculateOneTarget(tx, "provider", target.masterId);
  }
}

async function recalculateOneTarget(
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
  // STUDIO-REVIEW-MASTER-RATING: у мастера — и отзывы о визитах в студию, где
  // он исполнитель; правило общее со списком отзывов (`review-scope.ts`).
  const aggregate = await tx.review.aggregate({
    where: targetReviewsWhere(targetType, targetId),
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

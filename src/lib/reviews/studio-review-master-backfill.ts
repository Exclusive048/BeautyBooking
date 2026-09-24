import type { PrismaClient } from "@prisma/client";
import { recalculateTargetRatings } from "@/lib/reviews/recalculate-ratings";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

/**
 * STUDIO-REVIEW-MASTER-RATING — пост-деплой (`npm run deploy:post`): рейтинг
 * мастерам, у которых уже есть отзывы о визитах в студию. Новые отзывы
 * засчитываются мастеру при создании; оставленные раньше лежат в его рейтинге
 * только после пересчёта. Пересчёт идёт ЕДИНСТВЕННЫМ писателем рейтинга
 * (LOGIC-16), поэтому повтор безопасен: второй проход пишет то же самое.
 *
 * Без `server-only` в цепочке импортов — скрипт запускается обычным `tsx`.
 */
export async function backfillStudioReviewMasterRatings(prisma: PrismaClient): Promise<{ masters: number }> {
  const rows = await prisma.review.findMany({
    where: { targetType: "studio", masterId: { not: null }, ...ACTIVE_REVIEW_FILTER },
    select: { masterId: true },
    distinct: ["masterId"],
  });
  let masters = 0;
  for (const row of rows) {
    if (!row.masterId) continue;
    const masterId = row.masterId;
    await prisma.$transaction((tx) =>
      recalculateTargetRatings(tx, { targetType: "provider", targetId: masterId, masterId: null }),
    );
    masters += 1;
  }
  return { masters };
}

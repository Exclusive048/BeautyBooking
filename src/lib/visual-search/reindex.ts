import { MediaKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/queue/queue";
import { createVisualSearchIndexJob } from "@/lib/queue/types";
import { getVisualSearchConfig } from "@/lib/visual-search/config";
import { VISUAL_PIPELINE_VERSION } from "@/lib/visual-search/pipeline-version";

export const REINDEX_BATCH_SIZE = 500;

/**
 * Поставить в индексацию фото портфолио БЕЗ категории — ещё не разобранные и
 * помеченные нераспознанными. Единственная реализация: её зовут кнопка админа
 * (`POST /api/admin/visual-search/reindex` без `force`) и разовый прогон
 * воркера после смены конвейера (`requeueAfterPipelineChangeOnce`).
 *
 * VISUAL-SEARCH-TRANSIENT-01: у выбранных фото снимается `visualIndexed` —
 * нераспознанные несут `visualIndexed = true`, и индексатор их иначе пропускал
 * бы, то есть задача ставилась бы и ничего не делала. Векторов у таких фото
 * нет — сбрасывать нечего, кроме флага.
 */
export async function requeueUncategorizedPortfolio(): Promise<{ enqueued: number; batchLimited: boolean }> {
  const assets = await prisma.mediaAsset.findMany({
    where: { kind: MediaKind.PORTFOLIO, deletedAt: null, visualCategory: null },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: REINDEX_BATCH_SIZE,
  });
  await requeueAssets(assets.map((asset) => asset.id));
  return { enqueued: assets.length, batchLimited: assets.length === REINDEX_BATCH_SIZE };
}

async function requeueAssets(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.mediaAsset.updateMany({
    where: { id: { in: ids }, visualIndexed: true },
    data: { visualIndexed: false, visualIndexedAt: null },
  });
  await Promise.all(ids.map((assetId) => enqueue(createVisualSearchIndexJob({ assetId }))));
}

export const VISUAL_PIPELINE_REINDEX_KEY = "visualSearchPipelineReindexedVersion";

/**
 * VISUAL-SEARCH-UNRECOGNIZED-01 — один раз на версию конвейера переставить в
 * индексацию то, что старый конвейер счёл нераспознанным. Зовёт воркер при
 * старте (он же и индексирует). Метка — `SystemConfig`, поэтому повторный старт
 * воркера платных вызовов не повторяет. Пока визуальный поиск выключен, метка
 * не ставится: прогон случится, когда его включат.
 */
export async function requeueAfterPipelineChangeOnce(): Promise<{ ran: boolean; enqueued: number }> {
  const config = await getVisualSearchConfig();
  if (!config.enabled) return { ran: false, enqueued: 0 };

  // Метка захватывается ДО работы и атомарно: каждая поставленная задача —
  // до пяти платных вызовов, и второй прогон (падение между постановкой и
  // меткой, два воркера на перекрытии деплоя) оплатил бы всё повторно. Цена —
  // упавший посреди прогон не повторится сам; добивает кнопка админа
  // (`requeueUncategorizedPortfolio`).
  if (!(await claimPipelineReindex())) return { ran: false, enqueued: 0 };

  // Только то, что старый конвейер ПОМЕТИЛ нераспознанным (`visualIndexed`
  // без категории): ещё не разобранные фото стоят в очереди сами, и повторная
  // задача для них была бы дублем. И ВСЁ — страницами по курсору, а не одна
  // пачка в 500: при первом включении поиска таких фото может быть больше, и
  // остаток навсегда остался бы «нераспознанным».
  let enqueued = 0;
  let cursor: string | null = null;
  for (;;) {
    const page: Array<{ id: string }> = await prisma.mediaAsset.findMany({
      where: {
        kind: MediaKind.PORTFOLIO,
        deletedAt: null,
        visualCategory: null,
        visualIndexed: true,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: REINDEX_BATCH_SIZE,
    });
    if (page.length === 0) break;
    await requeueAssets(page.map((asset) => asset.id));
    enqueued += page.length;
    cursor = page[page.length - 1]!.id;
    if (page.length < REINDEX_BATCH_SIZE) break;
  }
  return { ran: true, enqueued };
}

async function claimPipelineReindex(): Promise<boolean> {
  const bumped = await prisma.systemConfig.updateMany({
    where: { key: VISUAL_PIPELINE_REINDEX_KEY, NOT: { value: { equals: VISUAL_PIPELINE_VERSION } } },
    data: { value: VISUAL_PIPELINE_VERSION },
  });
  if (bumped.count > 0) return true;
  try {
    await prisma.systemConfig.create({
      data: { key: VISUAL_PIPELINE_REINDEX_KEY, value: VISUAL_PIPELINE_VERSION },
    });
    return true;
  } catch (error) {
    // Строка уже есть и несёт эту версию — прогон был (или идёт в другом воркере).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

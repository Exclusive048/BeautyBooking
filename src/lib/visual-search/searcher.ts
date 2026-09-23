import { MediaAssetStatus, MediaKind, Prisma } from "@prisma/client";
import { logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import type {
  VisualSearchProviderResult,
  VisualSearchResponse,
} from "@/lib/visual-search/contracts";
import { getStrategy } from "@/lib/visual-search/category-registry";
import { classifyImage } from "@/lib/visual-search/classifier";
import { assertVisualSearchEnabled } from "@/lib/visual-search/config";
import {
  createQueryEmbedding,
  describeImageWithStrategy,
  resizeForVision,
  VisualProviderUnavailableError,
} from "@/lib/visual-search/provider";
import type { VisualCategorySlug, VisualSearchStrategy } from "@/lib/visual-search/prompt";
import { catalogVisibleProviderWhere } from "@/lib/providers/catalog-visibility";

/**
 * VISUAL-SEARCH-UNRECOGNIZED-01 (2026-09-23): два разных порога, которые жили
 * одним числом. Строгий отбор (по фильтрам стратегии) ослабляется, когда дал
 * меньше `RELAX_FILTERS_BELOW` кандидатов, — это про ширину выдачи. А отказ
 * «мало работ» теперь только при НУЛЕ кандидатов: выдача и так ранжируется по
 * похожести, а при прежнем «не меньше 5 работ в категории» на старте (у
 * категории 1–4 проиндексированные работы) поиск не находил НИЧЕГО, даже
 * загруженное фото самой проиндексированной работы.
 */
const RELAX_FILTERS_BELOW = 5;
const MIN_FILTERED_ASSETS = 1;
const FILTER_LIMIT = 5000;
const VECTOR_LIMIT = 50;
const EMBEDDING_DIMENSIONS = 256;
const MAX_PROVIDER_RESULTS = 5;
const MAX_PROVIDER_PHOTOS = 3;
/** Так же строит `PortfolioItem.mediaUrl` `resolvePortfolioMediaUrl` (profile.service). */
const MEDIA_FILE_PATH_PREFIX = "/api/media/file/";
/**
 * VISUAL-SEARCH-RANK-01 — множитель рейтинга. Раньше счёт умножался на
 * `ratingAvg / 5`, и у мастера без единого отзыва он был НУЛЁМ: любой
 * оценённый мастер, хоть с 1.0, стоял выше самого точного совпадения. На старте
 * платформы отзывов нет почти ни у кого, то есть рейтинг решал выдачу вместо
 * похожести. Теперь рейтинг подталкивает (5.0 → ×1, 1.0 → ×0.68), но не
 * обнуляет, а «ещё без отзывов» считается как крепкая середина (≈3.5).
 */
const RATING_FACTOR_FLOOR = 0.6;
const RATING_FACTOR_UNRATED = 0.88;

export function ratingFactor(ratingAvg: number): number {
  if (!Number.isFinite(ratingAvg) || ratingAvg <= 0) return RATING_FACTOR_UNRATED;
  const clamped = Math.min(5, ratingAvg);
  return RATING_FACTOR_FLOOR + (1 - RATING_FACTOR_FLOOR) * (clamped / 5);
}

type FilteredAssetRow = {
  id: string;
  entityId: string;
  createdAt: Date;
};

type SimilarityRow = {
  assetId: string;
  similarity: number;
};

type FilterPair = {
  field: string;
  value: string;
};

type ProviderAccumulator = {
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    avatarUrl: string | null;
    ratingAvg: number;
  };
  rawSimilaritySum: number;
  recencyWeightedSum: number;
  photos: Array<{ assetId: string; similarity: number }>;
};

function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("Invalid embedding dimensions");
  }
  const values = embedding.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error("Embedding contains non-finite value");
    }
    return Number(value).toString();
  });
  return `[${values.join(",")}]`;
}

function getRecencyFactor(createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < 30) return 1;
  if (ageDays < 90) return 0.8;
  return 0.6;
}

function extractFilterPairs(
  meta: Record<string, unknown>,
  strategy: VisualSearchStrategy
): FilterPair[] {
  const pairs: FilterPair[] = [];

  for (const field of strategy.filterFields) {
    const value = meta[field];
    if (typeof value === "string" && value.trim().length > 0) {
      pairs.push({ field, value: value.trim() });
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      pairs.push({ field, value: String(value) });
    }
  }

  return pairs;
}

async function findFilteredAssets(input: {
  category: VisualCategorySlug;
  filterPairs: FilterPair[];
  useStrictFilters: boolean;
}): Promise<FilteredAssetRow[]> {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`"deletedAt" IS NULL`,
    Prisma.sql`"kind" = ${MediaKind.PORTFOLIO}::"MediaKind"`,
    // Битый файл (`BROKEN`) в выдаче — это плитка без картинки.
    Prisma.sql`"status" = ${MediaAssetStatus.READY}::"MediaAssetStatus"`,
    Prisma.sql`"visualIndexed" = TRUE`,
    Prisma.sql`"visualCategory" = ${input.category}`,
    // VISUAL-SEARCH-VISIBILITY-01: работа, которую мастер скрыл из портфолио,
    // не выдаётся и поиском. Условие — «нет СКРЫТОЙ работы с этим фото», а не
    // «есть публичная»: у студийного портфолио строк `PortfolioItem` нет вовсе
    // (фото — это сам `MediaAsset`), и требование публичной работы вычеркнуло
    // бы из поиска все студии. Раньше скрытая работа не только находилась, но
    // и рендерилась битой плиткой: её файл анониму не отдаётся.
    Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "PortfolioItem" p
      WHERE p."mediaUrl" = ${MEDIA_FILE_PATH_PREFIX}::text || "MediaAsset"."id"
        AND p."isPublic" = FALSE
    )`,
  ];

  if (input.useStrictFilters) {
    for (const pair of input.filterPairs) {
      clauses.push(Prisma.sql`"visualMeta"->>${pair.field} = ${pair.value}`);
    }
  }

  return prisma.$queryRaw<FilteredAssetRow[]>(Prisma.sql`
    SELECT "id", "entityId", "createdAt"
    FROM "MediaAsset"
    WHERE ${Prisma.join(clauses, " AND ")}
    LIMIT ${FILTER_LIMIT}
  `);
}

async function searchSimilarities(
  assetIds: string[],
  queryEmbedding: number[]
): Promise<SimilarityRow[]> {
  if (assetIds.length === 0) return [];

  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const assetIdSql = Prisma.join(assetIds.map((id) => Prisma.sql`${id}`));

  return prisma.$queryRaw<SimilarityRow[]>(Prisma.sql`
    SELECT
      "asset_id" AS "assetId",
      1 - ("embedding" <=> ${vectorLiteral}::vector) AS "similarity"
    FROM "media_asset_embeddings"
    WHERE "asset_id" IN (${assetIdSql})
    ORDER BY "similarity" DESC
    LIMIT ${VECTOR_LIMIT}
  `);
}

function buildProviderResults(input: {
  category: VisualCategorySlug;
  filteredAssetsById: Map<string, FilteredAssetRow>;
  similarities: SimilarityRow[];
  providersById: Map<
    string,
    {
      id: string;
      name: string;
      publicUsername: string | null;
      avatarUrl: string | null;
      ratingAvg: number;
    }
  >;
}): VisualSearchProviderResult[] {
  const aggregations = new Map<string, ProviderAccumulator>();

  for (const match of input.similarities) {
    if (!Number.isFinite(match.similarity) || match.similarity <= 0) continue;
    const asset = input.filteredAssetsById.get(match.assetId);
    if (!asset) continue;
    const provider = input.providersById.get(asset.entityId);
    if (!provider) continue;

    const recencyFactor = getRecencyFactor(asset.createdAt);
    const current = aggregations.get(provider.id) ?? {
      provider,
      rawSimilaritySum: 0,
      recencyWeightedSum: 0,
      photos: [],
    };

    current.rawSimilaritySum += match.similarity;
    current.recencyWeightedSum += match.similarity * recencyFactor;
    current.photos.push({ assetId: asset.id, similarity: match.similarity });
    aggregations.set(provider.id, current);
  }

  const results = Array.from(aggregations.values()).map((item) => {
    const recencyFactor =
      item.rawSimilaritySum > 0 ? item.recencyWeightedSum / item.rawSimilaritySum : 0;
    const score = item.rawSimilaritySum * recencyFactor * ratingFactor(item.provider.ratingAvg);

    const matchingPhotos = [...item.photos]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_PROVIDER_PHOTOS)
      .map((photo) => ({
        assetId: photo.assetId,
        url: `/api/media/file/${photo.assetId}`,
        similarity: photo.similarity,
      }));

    return {
      provider: item.provider,
      matchingPhotos,
      score,
      category: input.category,
    } satisfies VisualSearchProviderResult;
  });

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_PROVIDER_RESULTS);
}

/**
 * VISUAL-SEARCH-DIAG-01 — почему поиск «не работает», по логам.
 *
 * 🔴 Дефект наблюдаемости, а не логики. Из девяти точек выхода `searchByImage`
 * не логировала НИ ОДНУ, а три структурно разные причины отдавали пользователю
 * один и тот же `not_enough_indexed`:
 *   · в базе нет проиндексированных фото нужной категории (доминирующий случай —
 *     визуальный поиск dormant, векторов ноль);
 *   · эмбеддинг запроса не построился — отказ провайдера на платном вызове;
 *   · векторное сравнение вернуло ноль строк либо все совпадения принадлежат
 *     НЕопубликованным кабинетам, то есть данные есть, но отфильтрованы.
 * По ответу и по логам они были неотличимы, поэтому «поиск не находит» нельзя
 * было свести ни к настройке, ни к пустому индексу, ни к отказу провайдера.
 *
 * `stage` — машинный признак точки выхода, он же ключ группировки. Числа рядом
 * (`filteredCount`, `similarityCount`, `publishedProviderCount`) — то, чего из
 * `reason` не видно: они прямо отвечают, чего именно не хватило. Снимка
 * изображения и текста описания в логе НЕТ намеренно: описание построено по
 * пользовательскому фото, это чужой контент, и для диагностики довольно длины.
 */
function logSearchOutcome(meta: Record<string, unknown>): void {
  logInfo("Visual search outcome", { scope: "visual-search:search", ...meta });
}

export async function searchByImage(imageBytes: Uint8Array): Promise<VisualSearchResponse> {
  await assertVisualSearchEnabled();

  try {
    return await runSearch(imageBytes);
  } catch (error) {
    // VISUAL-SEARCH-TRANSIENT-01: провайдер не ответил — это не «на фото ничего
    // нет». Отдельная причина: другой текст пользователю и ответ не кэшируется.
    if (error instanceof VisualProviderUnavailableError) {
      logSearchOutcome({
        stage: "provider_unavailable",
        reason: "unavailable",
        providerStatus: error.status,
      });
      return { ok: false, reason: "unavailable" };
    }
    throw error;
  }
}

async function runSearch(imageBytes: Uint8Array): Promise<VisualSearchResponse> {
  const resizedBytes = await resizeForVision(imageBytes);
  const classification = await classifyImage(resizedBytes, "visual-search:search");

  if (classification.category === "none") {
    logSearchOutcome({ stage: "classification_none", reason: "unrecognized" });
    return { ok: false, reason: "unrecognized" };
  }

  if (classification.confidence === "low") {
    logSearchOutcome({
      stage: "classification_low_confidence",
      reason: "low_confidence",
      category: classification.category,
    });
    return { ok: false, reason: "low_confidence" };
  }

  const strategy = getStrategy(classification.category);
  if (!strategy) {
    // Классификатор назвал категорию, которой нет в реестре стратегий: реестр и
    // промпт разъехались. Для пользователя это «не распознали», для нас —
    // рассинхрон конфигурации, и различить их можно только здесь.
    logSearchOutcome({
      stage: "strategy_missing",
      reason: "unrecognized",
      category: classification.category,
    });
    return { ok: false, reason: "unrecognized" };
  }

  const described = await describeImageWithStrategy(resizedBytes, strategy, "visual-search:search");
  if (described.error === "not_applicable") {
    logSearchOutcome({
      stage: "description_not_applicable",
      reason: "unrecognized",
      category: classification.category,
    });
    return { ok: false, reason: "unrecognized" };
  }

  const filterPairs = extractFilterPairs(described.meta, strategy);

  let filtered = await findFilteredAssets({
    category: classification.category,
    filterPairs,
    useStrictFilters: filterPairs.length > 0,
  });
  // Сколько дал СТРОГИЙ отбор до ослабления фильтров — иначе по одному итоговому
  // числу не видно, отсеяли кандидатов фильтры или их не было вовсе.
  const strictFilteredCount = filterPairs.length > 0 ? filtered.length : null;

  if (filtered.length < RELAX_FILTERS_BELOW && filterPairs.length > 0) {
    filtered = await findFilteredAssets({
      category: classification.category,
      filterPairs,
      useStrictFilters: false,
    });
  }

  if (filtered.length < MIN_FILTERED_ASSETS) {
    logSearchOutcome({
      stage: "no_indexed_assets",
      reason: "not_enough_indexed",
      category: classification.category,
      filterCount: filterPairs.length,
      strictFilteredCount,
      filteredCount: filtered.length,
      minRequired: MIN_FILTERED_ASSETS,
    });
    return { ok: false, reason: "not_enough_indexed" };
  }

  const queryEmbedding = await createQueryEmbedding(described.text_description);
  if (!queryEmbedding) {
    // Отказ ПРОВАЙДЕРА, а не пустой индекс: наружу уходит тот же `reason`, что и
    // у «нет данных», поэтому без этой записи причина неустановима.
    logSearchOutcome({
      stage: "query_embedding_failed",
      reason: "not_enough_indexed",
      category: classification.category,
      filteredCount: filtered.length,
      descriptionLength: described.text_description.length,
    });
    return { ok: false, reason: "not_enough_indexed" };
  }
  const similarities = await searchSimilarities(
    filtered.map((item) => item.id),
    queryEmbedding
  );
  if (similarities.length === 0) {
    // Кандидаты есть, а векторов для них нет: `MediaAsset.visualIndexed = TRUE`
    // без строки в `media_asset_embeddings` — рассинхрон индексации.
    logSearchOutcome({
      stage: "no_embedding_rows",
      reason: "not_enough_indexed",
      category: classification.category,
      filteredCount: filtered.length,
    });
    return { ok: false, reason: "not_enough_indexed" };
  }

  const providerIds = Array.from(new Set(filtered.map((item) => item.entityId)));
  const providers = await prisma.provider.findMany({
    where: { AND: [{ id: { in: providerIds } }, catalogVisibleProviderWhere()] },
    select: {
      id: true,
      name: true,
      publicUsername: true,
      avatarUrl: true,
      ratingAvg: true,
    },
  });

  const results = buildProviderResults({
    category: classification.category,
    filteredAssetsById: new Map(filtered.map((item) => [item.id, item])),
    similarities,
    providersById: new Map(providers.map((provider) => [provider.id, provider])),
  });

  if (results.length === 0) {
    // Данные и векторы есть, а выдача пуста — почти всегда потому, что все
    // совпавшие фото принадлежат НЕопубликованным кабинетам. Поэтому рядом с
    // числом кандидатов стоит число опубликованных из них.
    logSearchOutcome({
      stage: "no_published_matches",
      reason: "not_enough_indexed",
      category: classification.category,
      filteredCount: filtered.length,
      similarityCount: similarities.length,
      candidateProviderCount: providerIds.length,
      publishedProviderCount: providers.length,
    });
    return { ok: false, reason: "not_enough_indexed" };
  }

  logSearchOutcome({
    stage: "ok",
    category: classification.category,
    filteredCount: filtered.length,
    similarityCount: similarities.length,
    resultCount: results.length,
  });

  return {
    ok: true,
    results,
    category: classification.category,
  };
}

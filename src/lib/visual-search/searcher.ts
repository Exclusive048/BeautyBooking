import { MediaKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  VisualSearchProviderResult,
  VisualSearchResponse,
} from "@/lib/visual-search/contracts";
import { getStrategy } from "@/lib/visual-search/category-registry";
import { classifyImage } from "@/lib/visual-search/classifier";
import { assertVisualSearchEnabled } from "@/lib/visual-search/config";
import {
  createTextEmbedding,
  describeImageWithStrategy,
  resizeForOpenAI,
} from "@/lib/visual-search/openai";
import type { VisualCategorySlug, VisualSearchStrategy } from "@/lib/visual-search/prompt";

const MIN_FILTERED_ASSETS = 5;
const FILTER_LIMIT = 5000;
const VECTOR_LIMIT = 50;
const EMBEDDING_DIMENSIONS = 1536;
const MAX_PROVIDER_RESULTS = 5;
const MAX_PROVIDER_PHOTOS = 3;

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
    Prisma.sql`"visualIndexed" = TRUE`,
    Prisma.sql`"visualCategory" = ${input.category}`,
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
    const ratingFactor = Math.max(0, item.provider.ratingAvg) / 5;
    const recencyFactor =
      item.rawSimilaritySum > 0 ? item.recencyWeightedSum / item.rawSimilaritySum : 0;
    const score = item.rawSimilaritySum * recencyFactor * ratingFactor;

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

export async function searchByImage(imageBytes: Uint8Array): Promise<VisualSearchResponse> {
  await assertVisualSearchEnabled();

  const resizedBytes = await resizeForOpenAI(imageBytes);
  const classification = await classifyImage(resizedBytes);

  if (classification.category === "none") {
    return { ok: false, reason: "unrecognized" };
  }

  if (classification.confidence === "low") {
    return { ok: false, reason: "low_confidence" };
  }

  const strategy = getStrategy(classification.category);
  if (!strategy) {
    return { ok: false, reason: "unrecognized" };
  }

  const described = await describeImageWithStrategy(resizedBytes, strategy);
  if (described.error === "not_applicable") {
    return { ok: false, reason: "unrecognized" };
  }

  const filterPairs = extractFilterPairs(described.meta, strategy);

  let filtered = await findFilteredAssets({
    category: classification.category,
    filterPairs,
    useStrictFilters: filterPairs.length > 0,
  });

  if (filtered.length < MIN_FILTERED_ASSETS && filterPairs.length > 0) {
    filtered = await findFilteredAssets({
      category: classification.category,
      filterPairs,
      useStrictFilters: false,
    });
  }

  if (filtered.length < MIN_FILTERED_ASSETS) {
    return { ok: false, reason: "not_enough_indexed" };
  }

  const queryEmbedding = await createTextEmbedding(described.text_description);
  const similarities = await searchSimilarities(
    filtered.map((item) => item.id),
    queryEmbedding
  );
  if (similarities.length === 0) {
    return { ok: false, reason: "not_enough_indexed" };
  }

  const providerIds = Array.from(new Set(filtered.map((item) => item.entityId)));
  const providers = await prisma.provider.findMany({
    where: {
      id: { in: providerIds },
      isPublished: true,
    },
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
    return { ok: false, reason: "not_enough_indexed" };
  }

  return {
    ok: true,
    results,
    category: classification.category,
  };
}

import { Prisma, MediaKind, MediaEntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyImage } from "@/lib/visual-search/classifier";
import { getStrategy } from "@/lib/visual-search/category-registry";
import { callVisionJson, createEmbedding } from "@/lib/visual-search/openai";
import { ensureVisualSearchEnabled } from "@/lib/visual-search/settings";
import type { VisualSearchResult } from "@/lib/visual-search/prompt";
import { z } from "zod";

export type VisualSearchProviderResult = {
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    avatarUrl: string | null;
    ratingAvg: number;
  };
  matchingPhotos: Array<{ assetId: string; url: string; similarity: number }>;
  score: number;
  category: string;
};

export type VisualSearchResponse =
  | { ok: true; results: VisualSearchProviderResult[]; category: string }
  | { ok: false; reason: "unrecognized" | "not_enough_indexed" | "low_confidence" };

type FilterCondition = {
  field: string;
  value: string;
  mode: "text" | "array";
};

const descriptionSchema = z
  .object({
    text_description: z.string().min(1),
    error: z.literal("not_applicable").optional(),
  })
  .passthrough();

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractFilterConditions(meta: Record<string, unknown>, fields: string[]): FilterCondition[] {
  const result: FilterCondition[] = [];
  for (const field of fields) {
    const raw = meta[field];
    if (typeof raw === "string") {
      const value = raw.trim();
      if (value) result.push({ field, value, mode: "text" });
      continue;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      result.push({ field, value: String(raw), mode: "text" });
      continue;
    }
    if (Array.isArray(raw)) {
      const first = raw.find((item) => typeof item === "string" && item.trim()) as string | undefined;
      if (first) result.push({ field, value: first.trim(), mode: "array" });
    }
  }
  return result;
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toFixed(6)).join(",")}]`;
}

function recencyFactor(createdAt: Date, now: Date): number {
  const days = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 30) return 1.0;
  if (days < 90) return 0.8;
  return 0.6;
}

async function describeImage(input: {
  imageBytes: Uint8Array;
  systemPrompt: string;
  userPrompt: string;
}): Promise<VisualSearchResult> {
  const raw = await callVisionJson({
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    imageBytes: input.imageBytes,
    temperature: 0,
  });
  const parsed = safeParseJson(raw);
  if (!parsed) {
    throw new Error("Invalid visual search JSON response");
  }
  const validated = descriptionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Invalid visual search response schema");
  }
  return {
    text_description: validated.data.text_description,
    meta: parsed,
    error: validated.data.error,
  };
}

async function fetchFilteredAssetIds(input: {
  category: string;
  filters: FilterCondition[];
}): Promise<string[]> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"visualIndexed" = true`,
    Prisma.sql`"visualCategory" = ${input.category}`,
    Prisma.sql`"kind" = ${MediaKind.PORTFOLIO}`,
    Prisma.sql`"deletedAt" IS NULL`,
    Prisma.sql`"entityType" IN (${Prisma.join([MediaEntityType.MASTER, MediaEntityType.STUDIO])})`,
  ];

  for (const filter of input.filters) {
    if (filter.mode === "array") {
      conditions.push(Prisma.sql`("visualMeta" -> ${filter.field}) ? ${filter.value}`);
    } else {
      conditions.push(Prisma.sql`"visualMeta" ->> ${filter.field} = ${filter.value}`);
    }
  }

  const whereClause = Prisma.sql`${Prisma.join(conditions, " AND ")}`;

  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "MediaAsset" WHERE ${whereClause}`
  );
  return rows.map((row) => row.id);
}

export async function searchByImage(imageBytes: Uint8Array): Promise<VisualSearchResponse> {
  await ensureVisualSearchEnabled();

  const classification = await classifyImage(imageBytes);
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

  const described = await describeImage({
    imageBytes,
    systemPrompt: strategy.systemPrompt,
    userPrompt: strategy.userPrompt,
  });

  if (described.error === "not_applicable") {
    return { ok: false, reason: "unrecognized" };
  }

  const queryEmbedding = await createEmbedding(described.text_description);
  if (queryEmbedding.length === 0) {
    return { ok: false, reason: "not_enough_indexed" };
  }

  const filterConditions = extractFilterConditions(described.meta, strategy.filterFields);
  let filteredIds = await fetchFilteredAssetIds({
    category: classification.category,
    filters: filterConditions,
  });

  if (filteredIds.length < 5 && filterConditions.length > 0) {
    filteredIds = await fetchFilteredAssetIds({
      category: classification.category,
      filters: [],
    });
  }

  if (filteredIds.length < 5) {
    return { ok: false, reason: "not_enough_indexed" };
  }

  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const similarityRows = await prisma.$queryRaw<{ assetId: string; similarity: number }[]>(
    Prisma.sql`
      SELECT "assetId", 1 - ("embedding" <=> ${vectorLiteral}::vector) AS similarity
      FROM "MediaAssetEmbedding"
      WHERE "assetId" = ANY(${filteredIds})
      ORDER BY similarity DESC
      LIMIT 50
    `
  );

  const assetIds = similarityRows.map((row) => row.assetId);
  if (assetIds.length === 0) {
    return { ok: false, reason: "not_enough_indexed" };
  }

  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: assetIds } },
    select: {
      id: true,
      entityId: true,
      entityType: true,
      createdAt: true,
    },
  });
  const assetMap = new Map(assets.map((item) => [item.id, item]));

  const providerIds = Array.from(new Set(assets.map((item) => item.entityId)));
  const providers = await prisma.provider.findMany({
    where: { id: { in: providerIds } },
    select: { id: true, name: true, publicUsername: true, avatarUrl: true, ratingAvg: true },
  });
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));

  const now = new Date();
  const bucketMap = new Map<
    string,
    { matches: Array<{ assetId: string; similarity: number }>; scoreBase: number }
  >();

  for (const row of similarityRows) {
    const asset = assetMap.get(row.assetId);
    if (!asset) continue;
    if (asset.entityType !== MediaEntityType.MASTER && asset.entityType !== MediaEntityType.STUDIO) continue;
    const provider = providerMap.get(asset.entityId);
    if (!provider) continue;

    const recency = recencyFactor(asset.createdAt, now);
    const bucket = bucketMap.get(provider.id) ?? { matches: [], scoreBase: 0 };
    bucket.matches.push({ assetId: row.assetId, similarity: row.similarity });
    bucket.scoreBase += row.similarity * recency;
    bucketMap.set(provider.id, bucket);
  }

  const results: VisualSearchProviderResult[] = [];
  for (const [providerId, bucket] of bucketMap) {
    const provider = providerMap.get(providerId);
    if (!provider) continue;
    const ratingFactor = provider.ratingAvg > 0 ? provider.ratingAvg / 5 : 0;
    const score = bucket.scoreBase * ratingFactor;
    const matchingPhotos = bucket.matches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map((match) => ({
        assetId: match.assetId,
        url: `/api/media/file/${match.assetId}`,
        similarity: match.similarity,
      }));

    results.push({
      provider: {
        id: provider.id,
        name: provider.name,
        publicUsername: provider.publicUsername ?? null,
        avatarUrl: provider.avatarUrl ?? null,
        ratingAvg: provider.ratingAvg ?? 0,
      },
      matchingPhotos,
      score,
      category: classification.category,
    });
  }

  results.sort((a, b) => b.score - a.score);

  return {
    ok: true,
    results: results.slice(0, 5),
    category: classification.category,
  };
}

import { randomUUID } from "crypto";
import { Prisma, MediaKind, MediaEntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/media/storage";
import { logError, logInfo } from "@/lib/logging/logger";
import { classifyImage } from "@/lib/visual-search/classifier";
import { getStrategy } from "@/lib/visual-search/category-registry";
import { callVisionJson, createEmbedding } from "@/lib/visual-search/openai";
import { isVisualSearchEnabled } from "@/lib/visual-search/settings";
import type { VisualSearchResult } from "@/lib/visual-search/prompt";
import { z } from "zod";

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

async function readStreamToBytes(stream: NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toFixed(6)).join(",")}]`;
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

export async function indexMediaAsset(assetId: string): Promise<void> {
  const enabled = await isVisualSearchEnabled();
  if (!enabled) {
    logInfo("Visual search disabled, skipping index", { assetId });
    return;
  }

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      kind: true,
      entityType: true,
      storageKey: true,
      mimeType: true,
      visualIndexed: true,
      deletedAt: true,
    },
  });

  if (!asset || asset.deletedAt) {
    logError("Visual search asset not found", { assetId });
    return;
  }

  if (asset.kind !== MediaKind.PORTFOLIO || asset.visualIndexed) return;
  if (asset.entityType !== MediaEntityType.MASTER && asset.entityType !== MediaEntityType.STUDIO) {
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { visualIndexed: true, visualIndexedAt: new Date() },
    });
    return;
  }

  const storage = getStorageProvider();
  const file = await storage.getObject(asset.storageKey, asset.mimeType);
  if (!file) {
    logError("Visual search storage object missing", { assetId, storageKey: asset.storageKey });
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { visualIndexed: true, visualIndexedAt: new Date() },
    });
    return;
  }

  const bytes = await readStreamToBytes(file.stream);
  const classification = await classifyImage(bytes);
  if (classification.category === "none" || classification.confidence === "low") {
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        visualIndexed: true,
        visualIndexedAt: new Date(),
        visualCategory: null,
        visualPromptVersion: null,
      },
    });
    return;
  }

  const strategy = getStrategy(classification.category);
  if (!strategy) {
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        visualIndexed: true,
        visualIndexedAt: new Date(),
        visualCategory: null,
        visualPromptVersion: null,
      },
    });
    return;
  }

  const described = await describeImage({
    imageBytes: bytes,
    systemPrompt: strategy.systemPrompt,
    userPrompt: strategy.userPrompt,
  });

  if (described.error === "not_applicable") {
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        visualIndexed: true,
        visualIndexedAt: new Date(),
        visualCategory: null,
        visualPromptVersion: null,
      },
    });
    return;
  }

  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      visualMeta: described.meta as Prisma.InputJsonValue,
      visualDescription: described.text_description,
      visualPromptVersion: strategy.promptVersion,
      visualCategory: classification.category,
      visualIndexed: true,
      visualIndexedAt: new Date(),
    },
  });

  const embedding = await createEmbedding(described.text_description);
  if (embedding.length === 0) {
    throw new Error("Failed to create visual search embedding");
  }

  const vectorLiteral = toVectorLiteral(embedding);
  const embeddingId = randomUUID();

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "MediaAssetEmbedding" ("id", "assetId", "embedding")
      VALUES (${embeddingId}, ${asset.id}, ${vectorLiteral}::vector)
      ON CONFLICT ("assetId") DO UPDATE SET "embedding" = ${vectorLiteral}::vector
    `
  );
}

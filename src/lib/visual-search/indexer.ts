import { randomUUID } from "crypto";
import { Prisma, MediaKind } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/media/storage";
import { getStrategy } from "@/lib/visual-search/category-registry";
import { classifyImage } from "@/lib/visual-search/classifier";
import { assertVisualSearchEnabled } from "@/lib/visual-search/config";
import {
  createTextEmbedding,
  describeImageWithStrategy,
  isRetryableOpenAiError,
  resizeForOpenAI,
} from "@/lib/visual-search/openai";

const EMBEDDING_DIMENSIONS = 1536;

type PortfolioAsset = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  storageKey: string;
  visualIndexed: boolean;
  deletedAt: Date | null;
};

function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new AppError("Invalid embedding dimensions", 500, "INTERNAL_ERROR");
  }
  const items = embedding.map((value) => {
    if (!Number.isFinite(value)) {
      throw new AppError("Embedding contains non-finite value", 500, "INTERNAL_ERROR");
    }
    return Number(value).toString();
  });
  return `[${items.join(",")}]`;
}

async function readStorageBytes(storageKey: string, mimeType: string): Promise<Uint8Array> {
  const storage = getStorageProvider();
  const object = await storage.getObject(storageKey, mimeType);
  if (!object) {
    throw new AppError("Media asset file not found in storage", 404, "MEDIA_ASSET_NOT_FOUND");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of object.stream) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return new Uint8Array();
  }
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  return Buffer.concat(chunks);
}

async function markAssetAsUnrecognized(assetId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.update({
      where: { id: assetId },
      data: {
        visualIndexed: true,
        visualIndexedAt: new Date(),
        visualPromptVersion: null,
        visualDescription: null,
        visualMeta: Prisma.DbNull,
        visualCategory: null,
      },
    });
    await tx.$executeRaw`
      DELETE FROM "media_asset_embeddings"
      WHERE "asset_id" = ${assetId}
    `;
  });
}

async function getPortfolioAsset(assetId: string): Promise<PortfolioAsset | null> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      kind: true,
      mimeType: true,
      storageKey: true,
      visualIndexed: true,
      deletedAt: true,
    },
  });

  if (!asset || asset.deletedAt) return null;
  if (asset.kind !== MediaKind.PORTFOLIO) return null;
  if (asset.visualIndexed) return null;
  return asset;
}

export async function indexMediaAsset(assetId: string): Promise<void> {
  const asset = await getPortfolioAsset(assetId);
  if (!asset) return;

  await assertVisualSearchEnabled();

  const originalBytes = await readStorageBytes(asset.storageKey, asset.mimeType);
  const resizedBytes = await resizeForOpenAI(originalBytes);

  const classification = await classifyImage(resizedBytes);
  if (classification.category === "none" || classification.confidence === "low") {
    await markAssetAsUnrecognized(asset.id);
    return;
  }

  const strategy = getStrategy(classification.category);
  if (!strategy) {
    await markAssetAsUnrecognized(asset.id);
    return;
  }

  const visualResult = await describeImageWithStrategy(resizedBytes, strategy);
  if (visualResult.error === "not_applicable") {
    await markAssetAsUnrecognized(asset.id);
    return;
  }

  const embedding = await createTextEmbedding(visualResult.text_description);
  const vectorLiteral = toVectorLiteral(embedding);
  const mappedCategory = await prisma.globalCategory.findFirst({
    where: {
      visualSearchSlug: classification.category,
      status: "APPROVED",
    },
    select: { id: true },
  });
  const mediaUrlSuffix = `/api/media/file/${asset.id}`;

  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.update({
      where: { id: asset.id },
      data: {
        visualMeta: visualResult.meta as Prisma.InputJsonValue,
        visualDescription: visualResult.text_description,
        visualPromptVersion: strategy.promptVersion,
        visualCategory: classification.category,
        visualIndexed: true,
        visualIndexedAt: new Date(),
      },
    });

    if (mappedCategory) {
      const updatedPortfolioItems = await tx.portfolioItem.updateMany({
        where: {
          mediaUrl: { endsWith: mediaUrlSuffix },
          OR: [{ globalCategoryId: null }, { categorySource: "ai" }, { inSearch: false }],
        },
        data: {
          globalCategoryId: mappedCategory.id,
          categorySource: "ai",
          inSearch: true,
        },
      });

      if (updatedPortfolioItems.count > 0) {
        await tx.globalCategory.update({
          where: { id: mappedCategory.id },
          data: { usageCount: { increment: updatedPortfolioItems.count } },
        });
      }
    }

    await tx.$executeRaw`
      INSERT INTO "media_asset_embeddings" ("id", "asset_id", "embedding")
      VALUES (${randomUUID()}, ${asset.id}, ${vectorLiteral}::vector)
      ON CONFLICT ("asset_id")
      DO UPDATE SET "embedding" = EXCLUDED."embedding"
    `;
  });
}

export function isVisualSearchMissingAssetError(error: unknown): boolean {
  return error instanceof AppError && error.code === "MEDIA_ASSET_NOT_FOUND";
}

export function isVisualSearchRetryableError(error: unknown): boolean {
  return isRetryableOpenAiError(error);
}


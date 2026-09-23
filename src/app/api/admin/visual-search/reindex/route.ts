import { MediaKind, Prisma } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAdminAuth } from "@/lib/auth/admin";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/queue/queue";
import { createVisualSearchIndexJob } from "@/lib/queue/types";
import { REINDEX_BATCH_SIZE, requeueUncategorizedPortfolio } from "@/lib/visual-search/reindex";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    // Default: enqueue only not-yet-categorized assets (visualCategory=null).
    // Force (?force=true): re-index ALL portfolio assets — resets the indexer's
    // `visualIndexed === true` skip-guard and drops stale vectors first, so a
    // re-index actually runs (needed e.g. after a dimension migration). Without
    // the reset the guard would silently no-op already-indexed assets (audit F1).
    const force = new URL(req.url).searchParams.get("force") === "true";

    // Без `force` — общий путь «фото без категории» (он же разовый прогон
    // воркера после смены конвейера, `lib/visual-search/reindex.ts`).
    if (!force) {
      const result = await requeueUncategorizedPortfolio();
      return jsonOk({ enqueued: result.enqueued, forced: false, batchLimited: result.batchLimited });
    }

    const assets = await prisma.mediaAsset.findMany({
      where: { kind: MediaKind.PORTFOLIO, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: REINDEX_BATCH_SIZE,
    });

    if (assets.length > 0) {
      const ids = assets.map((asset) => asset.id);
      await prisma.$transaction(async (tx) => {
        await tx.mediaAsset.updateMany({
          where: { id: { in: ids } },
          data: {
            visualIndexed: false,
            visualIndexedAt: null,
            visualPromptVersion: null,
            visualDescription: null,
            visualMeta: Prisma.DbNull,
            visualCategory: null,
          },
        });
        await tx.mediaAssetEmbedding.deleteMany({ where: { assetId: { in: ids } } });
      });
    }

    await Promise.all(
      assets.map((asset) => enqueue(createVisualSearchIndexJob({ assetId: asset.id })))
    );

    return jsonOk({
      enqueued: assets.length,
      forced: force,
      // A full re-index across >BATCH_SIZE assets needs the CLI backfill script
      // (scripts/backfill-visual-embeddings.ts) — this route caps at one batch.
      batchLimited: assets.length === REINDEX_BATCH_SIZE,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/admin/visual-search/reindex failed", {
        requestId: getRequestId(req),
        route: "POST /api/admin/visual-search/reindex",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

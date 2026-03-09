import { randomUUID } from "crypto";
import { MediaKind } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAdminAuth } from "@/lib/auth/admin";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/queue/queue";

export const runtime = "nodejs";

const BATCH_SIZE = 500;

export async function POST(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const unindexed = await prisma.mediaAsset.findMany({
      where: {
        kind: MediaKind.PORTFOLIO,
        deletedAt: null,
        visualCategory: null,
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: BATCH_SIZE,
    });

    await Promise.all(
      unindexed.map(async (asset) => {
        await enqueue({
          id: randomUUID(),
          type: "visual_search_index",
          payload: { assetId: asset.id },
        });
      })
    );

    return jsonOk({ enqueued: unindexed.length });
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

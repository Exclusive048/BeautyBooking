import { MediaKind, Prisma } from "@prisma/client";
import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAdminAuth } from "@/lib/auth/admin";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/queue/queue";
import { createVisualSearchIndexJob } from "@/lib/queue/types";
import { getSupportedSlugs } from "@/lib/visual-search/category-registry";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

const reindexSchema = z.object({
  categorySlug: z.string().trim().min(1).optional(),
  promptVersion: z.string().trim().min(1).optional(),
});

const BATCH_SIZE = 500;

export async function POST(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = reindexSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail(400, UI_TEXT.admin.visualSearch.validationError, "VALIDATION_ERROR", {
        issues: parsed.error.issues,
      });
    }

    const categorySlug = parsed.data.categorySlug;
    if (categorySlug && !getSupportedSlugs().includes(categorySlug)) {
      return jsonFail(400, UI_TEXT.admin.visualSearch.unknownCategory, "VALIDATION_ERROR");
    }

    const orConditions: Prisma.MediaAssetWhereInput[] = [{ visualIndexed: false }];
    if (parsed.data.promptVersion) {
      orConditions.push({
        OR: [
          { visualPromptVersion: null },
          { NOT: { visualPromptVersion: parsed.data.promptVersion } },
        ],
      });
    }
    if (categorySlug) {
      orConditions.push({ visualCategory: categorySlug });
    }

    const where: Prisma.MediaAssetWhereInput = {
      kind: MediaKind.PORTFOLIO,
      deletedAt: null,
      OR: orConditions,
    };

    let queued = 0;
    let cursorId: string | undefined;

    while (true) {
      const assets = await prisma.mediaAsset.findMany({
        where,
        select: { id: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });

      if (assets.length === 0) break;

      await Promise.all(
        assets.map(async (asset) => {
          await enqueue(createVisualSearchIndexJob({ assetId: asset.id }));
        })
      );

      queued += assets.length;
      cursorId = assets[assets.length - 1]?.id;
    }

    return jsonOk({ queued });
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

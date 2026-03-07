import { Prisma } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAdminAuth } from "@/lib/auth/admin";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { getSupportedSlugs } from "@/lib/visual-search/category-registry";

export const runtime = "nodejs";

type GroupRow = {
  key: string | null;
  count: number;
};

async function countBySql(whereSql: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "MediaAsset"
    WHERE ${whereSql}
  `);
  return rows[0]?.count ?? 0;
}

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const baseWhere = Prisma.sql`"kind" = 'PORTFOLIO'::"MediaKind" AND "deletedAt" IS NULL`;

    const [total, indexed, unrecognized, byCategoryRows, byPromptVersionRows] =
      await Promise.all([
        countBySql(baseWhere),
        countBySql(Prisma.sql`${baseWhere} AND "visualIndexed" = TRUE`),
        countBySql(
          Prisma.sql`${baseWhere} AND "visualIndexed" = TRUE AND "visualCategory" IS NULL`
        ),
        prisma.$queryRaw<GroupRow[]>(Prisma.sql`
          SELECT "visualCategory" AS "key", COUNT(*)::int AS "count"
          FROM "MediaAsset"
          WHERE ${baseWhere} AND "visualIndexed" = TRUE AND "visualCategory" IS NOT NULL
          GROUP BY "visualCategory"
        `),
        prisma.$queryRaw<GroupRow[]>(Prisma.sql`
          SELECT "visualPromptVersion" AS "key", COUNT(*)::int AS "count"
          FROM "MediaAsset"
          WHERE ${baseWhere} AND "visualIndexed" = TRUE AND "visualPromptVersion" IS NOT NULL
          GROUP BY "visualPromptVersion"
        `),
      ]);

    const byCategory: Record<string, { indexed: number }> = Object.fromEntries(
      getSupportedSlugs().map((slug) => [slug, { indexed: 0 }])
    );
    for (const row of byCategoryRows) {
      if (!row.key) continue;
      byCategory[row.key] = { indexed: row.count };
    }

    const byPromptVersion: Record<string, number> = {};
    for (const row of byPromptVersionRows) {
      if (!row.key) continue;
      byPromptVersion[row.key] = row.count;
    }

    return jsonOk({
      total,
      indexed,
      unrecognized,
      byCategory,
      byPromptVersion,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/admin/visual-search/stats failed", {
        requestId: getRequestId(req),
        route: "GET /api/admin/visual-search/stats",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

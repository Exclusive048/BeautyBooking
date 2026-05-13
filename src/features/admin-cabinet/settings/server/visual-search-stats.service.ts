import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { VisualSearchStatsView } from "@/features/admin-cabinet/settings/types";

async function countBySql(whereSql: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "MediaAsset"
    WHERE ${whereSql}
  `);
  return rows[0]?.count ?? 0;
}

export async function getVisualSearchStatsView(): Promise<VisualSearchStatsView> {
  const baseWhere = Prisma.sql`"kind" = 'PORTFOLIO'::"MediaKind" AND "deletedAt" IS NULL`;

  const [total, indexed] = await Promise.all([
    countBySql(baseWhere),
    countBySql(Prisma.sql`${baseWhere} AND "visualIndexed" = TRUE`),
  ]);

  return {
    total,
    indexed,
    notIndexed: Math.max(0, total - indexed),
  };
}

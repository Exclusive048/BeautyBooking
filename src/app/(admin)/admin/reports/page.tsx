import { ContentReportTargetType } from "@prisma/client";
import { AdminReports } from "@/features/admin-cabinet/reports/components/admin-reports";
import {
  getAdminContentReportCounts,
  listAdminContentReports,
} from "@/features/admin-cabinet/reports/server/reports.service";
import type {
  AdminReportStatusTab,
  AdminReportTypeFilter,
} from "@/features/admin-cabinet/reports/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
  type?: string;
  cursor?: string;
}>;

function parseStatus(value: string | undefined): AdminReportStatusTab {
  if (value === "resolved" || value === "dismissed" || value === "all") return value;
  return "new";
}

function parseType(value: string | undefined): AdminReportTypeFilter {
  const types = Object.values(ContentReportTargetType) as string[];
  return value && types.includes(value) ? (value as ContentReportTargetType) : "all";
}

/** MOBILE-POLISH (App Store 1.2) — «Жалобы»: очередь жалоб пользователей на контент. */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const type = parseType(params.type);
  const cursor = params.cursor?.trim() || null;

  const [counts, list] = await Promise.all([
    getAdminContentReportCounts(),
    listAdminContentReports({ status, type, cursor }),
  ]);

  return (
    <AdminReports
      counts={counts}
      rows={list.items}
      nextCursor={list.nextCursor}
      filters={{ status, type }}
    />
  );
}

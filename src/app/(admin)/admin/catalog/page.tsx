import { AdminCatalog } from "@/features/admin-cabinet/catalog/components/admin-catalog";
import {
  getCategoryCounts,
  listAdminCategories,
  listParentOptions,
} from "@/features/admin-cabinet/catalog/server/categories.service";
import type { AdminCategoryStatusFilter } from "@/features/admin-cabinet/catalog/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
  parent?: string;
  q?: string;
}>;

function parseStatus(value: string | undefined): AdminCategoryStatusFilter {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "all"
  ) {
    return value;
  }
  return "all";
}

function parseParent(value: string | undefined): string | "all" | "root" {
  if (value === "root" || value === "all" || !value) return value ?? "all";
  return value;
}

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const parent = parseParent(params.parent);
  const search = (params.q ?? "").trim();

  const [rows, counts, parentOptions] = await Promise.all([
    listAdminCategories({ status, parent, search }),
    getCategoryCounts(),
    listParentOptions(),
  ]);

  return (
    <AdminCatalog
      rows={rows}
      parentOptions={parentOptions}
      counts={counts}
      filters={{ status, parent, search }}
    />
  );
}

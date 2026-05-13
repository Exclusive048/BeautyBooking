import { AdminCities } from "@/features/admin-cabinet/cities/components/admin-cities";
import {
  getCitiesCounts,
  getProvidersWithoutCityCount,
  listAdminCities,
} from "@/features/admin-cabinet/cities/server/cities.service";
import type { AdminCityStatusFilter } from "@/features/admin-cabinet/cities/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
  q?: string;
  selected?: string;
}>;

function parseStatus(value: string | undefined): AdminCityStatusFilter {
  if (
    value === "all" ||
    value === "visible" ||
    value === "hidden" ||
    value === "dup"
  ) {
    return value;
  }
  return "all";
}

export default async function AdminCitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const search = (params.q ?? "").trim();
  const selectedId = params.selected?.trim() || null;

  const [{ rows, duplicateGroups }, counts, providersWithoutCityCount] =
    await Promise.all([
      listAdminCities({ status, search }),
      getCitiesCounts(),
      getProvidersWithoutCityCount(),
    ]);

  return (
    <AdminCities
      rows={rows}
      duplicateGroups={duplicateGroups}
      counts={counts}
      providersWithoutCityCount={providersWithoutCityCount}
      filters={{ status, search, selectedId }}
    />
  );
}

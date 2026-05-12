import { CategoryStatus, DiscountType, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Server aggregator for `/cabinet/master/services` (31c).
 *
 * One round-trip:
 *  - master's full Service list (sorted by sortOrder asc, createdAt desc)
 *  - master's ServicePackages with items, computed pricing, and a
 *    "components disabled" flag that the row UI surfaces as a warning
 *  - master-visible global categories (same visibility rules as 31b
 *    portfolio: APPROVED+visibleToAll OR createdBy/proposedBy this user)
 *  - per-bucket counts for the filter chips
 */

export type ServicesFilterId = "all" | "services" | "bundles" | "disabled";

const VALID_FILTERS: ReadonlySet<ServicesFilterId> = new Set([
  "all",
  "services",
  "bundles",
  "disabled",
]);

export function parseServicesFilter(value: string | null | undefined): ServicesFilterId {
  if (value && VALID_FILTERS.has(value as ServicesFilterId)) {
    return value as ServicesFilterId;
  }
  return "all";
}

export type ServiceCategoryOption = {
  id: string;
  name: string;
  /** Approval state — passed to the UI so the master's own pending
   * proposals can carry a «(на одобрении)» suffix instead of looking
   * indistinguishable from approved ones. APPROVED categories load
   * cleanly; PENDING / REJECTED only appear when the master is the
   * proposer (filter is in `listAvailableGlobalCategories`). */
  status: CategoryStatus;
};

export type ServiceItemView = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  isEnabled: boolean;
  onlinePaymentEnabled: boolean;
  globalCategoryId: string | null;
  globalCategoryName: string | null;
  sortOrder: number;
  /** Position in the master's full service list. UI uses for reorder
   * boundary detection (same pattern as 31b portfolio). */
  globalIndex: number;
  globalCount: number;
};

export type ServicesByCategory = {
  /** GlobalCategory.id when known, null for the uncategorised bucket. */
  id: string | null;
  name: string;
  services: ServiceItemView[];
};

export type ServicePackageView = {
  id: string;
  name: string;
  isEnabled: boolean;
  discountType: DiscountType;
  discountValue: number;
  /** Sum of component prices (kopeks). */
  totalPrice: number;
  /** Computed discount in kopeks. PERCENT applies to totalPrice; FIXED
   * is taken at face value (capped at totalPrice). */
  discountAmount: number;
  /** totalPrice - discountAmount, never negative. */
  finalPrice: number;
  /** Sum of component durations (minutes). */
  totalDurationMin: number;
  /** Component service IDs in selection order (sorted by service sortOrder
   * for deterministic display). */
  serviceIds: string[];
  /** Display names of component services — saves the UI another lookup. */
  serviceNames: string[];
  /** True when at least one component service is `isEnabled = false`.
   * Row UI shows a warning chip; backend booking flow integration is on
   * the BACKLOG (no public exposure of bundles in this commit). */
  hasDisabledComponent: boolean;
  sortOrder: number;
  globalIndex: number;
  globalCount: number;
};

export type ServicesKpi = {
  servicesCount: number;
  bundlesCount: number;
  disabledCount: number;
};

export type MasterServicesViewData = {
  providerId: string;
  kpi: ServicesKpi;
  filterCounts: Record<ServicesFilterId, number>;
  /** Categorised services for the accordion view. Includes only
   * services that pass the active filter. Empty buckets are dropped at
   * UI render time. */
  categorizedServices: ServicesByCategory[];
  bundles: ServicePackageView[];
  /** All services (unfiltered) — used for the bundle modal's
   * multi-select. Includes disabled ones so the master can revive a
   * bundle component without first re-enabling it. */
  allServicesFlat: Array<{
    id: string;
    name: string;
    durationMin: number;
    price: number;
    isEnabled: boolean;
  }>;
  availableCategories: ServiceCategoryOption[];
  activeFilter: ServicesFilterId;
};

export async function getMasterServicesView(input: {
  userId: string;
  filter: ServicesFilterId;
}): Promise<MasterServicesViewData | null> {
  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: ProviderType.MASTER },
    select: { id: true, ownerUserId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!provider) return null;

  const [services, packages, availableCategories] = await Promise.all([
    prisma.service.findMany({
      where: { providerId: provider.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { globalCategory: { select: { id: true, name: true } } },
    }),
    prisma.servicePackage.findMany({
      where: { masterId: provider.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        items: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                title: true,
                durationMin: true,
                price: true,
                isEnabled: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    }),
    listAvailableGlobalCategories(provider.ownerUserId),
  ]);

  const serviceById = new Map(services.map((service) => [service.id, service]));

  const servicesFlat: ServiceItemView[] = services.map((service, index) => ({
    id: service.id,
    name: service.title?.trim() || service.name,
    description: service.description,
    durationMin: service.durationMin,
    price: service.price,
    isEnabled: service.isEnabled,
    onlinePaymentEnabled: service.onlinePaymentEnabled,
    globalCategoryId: service.globalCategoryId,
    globalCategoryName: service.globalCategory?.name ?? null,
    sortOrder: service.sortOrder,
    globalIndex: index,
    globalCount: services.length,
  }));

  const bundles: ServicePackageView[] = packages.map((pkg, index) => {
    // Order components by their service.sortOrder so the row caption is
    // deterministic (and matches the order shown in the categorised list).
    const sortedItems = [...pkg.items].sort(
      (a, b) => a.service.sortOrder - b.service.sortOrder
    );
    const totalPrice = sortedItems.reduce((sum, item) => sum + item.service.price, 0);
    const totalDurationMin = sortedItems.reduce(
      (sum, item) => sum + item.service.durationMin,
      0
    );
    const discountAmount =
      pkg.discountType === DiscountType.PERCENT
        ? Math.round((totalPrice * pkg.discountValue) / 100)
        : Math.min(totalPrice, pkg.discountValue);
    const finalPrice = Math.max(0, totalPrice - discountAmount);
    return {
      id: pkg.id,
      name: pkg.name,
      isEnabled: pkg.isEnabled,
      discountType: pkg.discountType,
      discountValue: pkg.discountValue,
      totalPrice,
      discountAmount,
      finalPrice,
      totalDurationMin,
      serviceIds: sortedItems.map((item) => item.serviceId),
      serviceNames: sortedItems.map(
        (item) => item.service.title?.trim() || item.service.name
      ),
      hasDisabledComponent: sortedItems.some((item) => !item.service.isEnabled),
      sortOrder: pkg.sortOrder,
      globalIndex: index,
      globalCount: packages.length,
    };
  });

  // KPI is over the full population — filter doesn't shift the
  // dashboard counters.
  const kpi: ServicesKpi = {
    servicesCount: servicesFlat.filter((service) => service.isEnabled).length,
    bundlesCount: bundles.filter((bundle) => bundle.isEnabled).length,
    disabledCount:
      servicesFlat.filter((service) => !service.isEnabled).length +
      bundles.filter((bundle) => !bundle.isEnabled).length,
  };

  const filterCounts: Record<ServicesFilterId, number> = {
    all: servicesFlat.length + bundles.length,
    services: servicesFlat.length,
    bundles: bundles.length,
    disabled: kpi.disabledCount,
  };

  // Apply the active filter — note "disabled" filters BOTH services and
  // bundles by their `isEnabled` flag.
  const filterServices = (service: ServiceItemView): boolean => {
    if (input.filter === "bundles") return false;
    if (input.filter === "disabled") return !service.isEnabled;
    return true;
  };
  const filterBundles = (bundle: ServicePackageView): boolean => {
    if (input.filter === "services") return false;
    if (input.filter === "disabled") return !bundle.isEnabled;
    return true;
  };

  const categorizedServices = groupByCategory(servicesFlat.filter(filterServices));
  const filteredBundles = bundles.filter(filterBundles);

  const allServicesFlat = services.map((service) => ({
    id: service.id,
    name: service.title?.trim() || service.name,
    durationMin: service.durationMin,
    price: service.price,
    isEnabled: service.isEnabled,
  }));

  // Defensive: ensure bundle service references that no longer exist in
  // the master's catalog don't break the UI. (Cascade should keep this
  // clean, but harmless to filter.)
  for (const bundle of bundles) {
    bundle.serviceIds = bundle.serviceIds.filter((id) => serviceById.has(id));
  }

  return {
    providerId: provider.id,
    kpi,
    filterCounts,
    categorizedServices,
    bundles: filteredBundles,
    allServicesFlat,
    availableCategories,
    activeFilter: input.filter,
  };
}

function groupByCategory(services: ServiceItemView[]): ServicesByCategory[] {
  const buckets = new Map<string | null, ServicesByCategory>();
  for (const service of services) {
    const key = service.globalCategoryId;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        id: key,
        name: service.globalCategoryName ?? "Без категории",
        services: [],
      };
      buckets.set(key, bucket);
    }
    bucket.services.push(service);
  }
  // Categories sorted alphabetically; "Без категории" pinned to the end.
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.name.localeCompare(b.name, "ru");
  });
}

async function listAvailableGlobalCategories(
  ownerUserId: string | null
): Promise<ServiceCategoryOption[]> {
  const rows = await prisma.globalCategory.findMany({
    where: {
      visualSearchSlug: { not: "hot" },
      OR: [
        { status: CategoryStatus.APPROVED, visibleToAll: true },
        ...(ownerUserId
          ? [{ createdByUserId: ownerUserId }, { proposedBy: ownerUserId }]
          : []),
      ],
    },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, status: row.status }));
}

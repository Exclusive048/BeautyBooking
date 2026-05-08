import { ModelApplicationStatus, ModelOfferStatus, type Prisma } from "@prisma/client";
import {
  buildPrivateMediaDeliveryUrl,
  createPrivateMediaDeliveryToken,
} from "@/lib/media/private-delivery";
import { prisma } from "@/lib/prisma";
import {
  computeConversionRate,
  computeOfferDiscountPct,
} from "@/lib/master/model-offers-stats";

/**
 * Server aggregator for `/cabinet/master/model-offers` (29a). Read-only —
 * mutations stay on the existing API routes (29b backlog).
 *
 * Single round-trip for the page:
 *   - all offers for this master (any status), oldest first by date
 *   - all applications for those offers (one batched query)
 *   - all photos for those applications (one batched MediaAsset query,
 *     turned into token-signed delivery URLs)
 *   - service titles + master service price overrides for discount math
 *
 * Discount is computed server-side from (regularPrice - offerPrice) /
 * regularPrice — see `computeOfferDiscountPct`. Schema doesn't store the
 * discount; the offer just has its own `price` and we compare against
 * what the master normally charges for that service.
 *
 * The page's URL filter `?filterOffer=<id>` only narrows the **pending**
 * applications section — the active offers list shows everything. When
 * the offer id is unknown (stale link), filter resolves to "all" silently.
 */

export type OfferServiceItem = {
  id: string;
  title: string;
  durationMin: number;
  /** Regular price for this service (what masters normally charge), in
   * kopeks. Null when not set. */
  regularPrice: number | null;
};

export type OfferApplicationCounts = {
  total: number;
  pending: number;
  approvedWaitingClient: number;
  confirmed: number;
  rejected: number;
};

export type ActiveOfferItem = {
  id: string;
  dateLocal: string;
  timeRangeStartLocal: string;
  timeRangeEndLocal: string;
  /** Offer price in kopeks, null when "free / casting" */
  offerPrice: number | null;
  /** Regular price in kopeks for the primary service, null if unknown. */
  regularPrice: number | null;
  /** % discount, null when there is no discount or no comparable price. */
  discountPct: number | null;
  durationMin: number;
  extraBusyMin: number;
  status: ModelOfferStatus;
  primaryService: OfferServiceItem | null;
  selectedServices: OfferServiceItem[];
  requirements: string[];
  counts: OfferApplicationCounts;
  /** Conversion: confirmed / total, % rounded. Null when no applications. */
  conversionRate: number | null;
  createdAt: string;
};

export type ApplicationPhoto = {
  id: string;
  url: string;
};

export type ApplicationItem = {
  id: string;
  status: ModelApplicationStatus;
  clientNote: string | null;
  consentToShoot: boolean;
  proposedTimeLocal: string | null;
  confirmedStartAt: string | null;
  bookingId: string | null;
  createdAt: string;
  client: {
    id: string;
    displayName: string;
    initials: string;
    avatarSeed: string;
  };
  photos: ApplicationPhoto[];
  /** Snapshot of the offer this application targets — lets the application
   * card render "к окошку 12 мая · 14:00–17:00" without lookup gymnastics
   * on the client. */
  offer: {
    id: string;
    dateLocal: string;
    timeRangeStartLocal: string;
    timeRangeEndLocal: string;
    primaryServiceTitle: string | null;
    discountPct: number | null;
  };
};

export type OffersKpi = {
  activeOffersCount: number;
  pendingApplicationsCount: number;
  conversionRate: number | null;
  archivedCount: number;
};

export type OfferFilterOption = {
  id: string;
  label: string;
};

export type AvailableServiceForOffer = {
  /** Service.id (used as `masterServiceId` payload field by the create
   * endpoint — solo masters don't have MasterService rows; the existing
   * route resolves either path). */
  id: string;
  title: string;
  durationMin: number;
  /** Regular price in kopeks; null if not set. */
  regularPrice: number | null;
};

export type MasterModelOffersViewData = {
  kpi: OffersKpi;
  /** Offers with status ACTIVE — split first because they get the prominent
   * top card. Sorted by date ascending so the next event is closest to
   * the eye. Past-dated active offers (the master forgot to close) sink
   * to the bottom of the list. */
  activeOffers: ActiveOfferItem[];
  /** Active applications waiting for the master's decision (PENDING). The
   * UI shows them with photos + actions. Filtered by `filterOfferId` when
   * present. */
  pendingApplications: ApplicationItem[];
  archivedOffers: ActiveOfferItem[];
  filterOptions: OfferFilterOption[];
  activeFilterOfferId: string | null;
  totalPendingBeforeFilter: number;
  /** Master's enabled services — input for the create/edit offer modals.
   * Used both to populate the service dropdown and to compute the live
   * discount % as the master types a price. */
  availableServices: AvailableServiceForOffer[];
};

const ACTIVE_STATUS = ModelOfferStatus.ACTIVE;

export async function getMasterModelOffersView(input: {
  masterProviderId: string;
  filterOfferId: string | null;
  now?: Date;
}): Promise<MasterModelOffersViewData> {
  const now = input.now ?? new Date();

  const offers = await prisma.modelOffer.findMany({
    where: { masterId: input.masterProviderId },
    orderBy: [{ dateLocal: "asc" }, { timeRangeStartLocal: "asc" }, { id: "asc" }],
    select: {
      id: true,
      dateLocal: true,
      timeRangeStartLocal: true,
      timeRangeEndLocal: true,
      price: true,
      requirements: true,
      extraBusyMin: true,
      status: true,
      serviceIds: true,
      createdAt: true,
      masterService: {
        select: {
          id: true,
          priceOverride: true,
          durationOverrideMin: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              durationMin: true,
              baseDurationMin: true,
              price: true,
              basePrice: true,
            },
          },
        },
      },
      service: {
        select: {
          id: true,
          name: true,
          title: true,
          durationMin: true,
          baseDurationMin: true,
          price: true,
          basePrice: true,
        },
      },
    },
  });

  const availableServices = await loadAvailableServices(input.masterProviderId);

  if (offers.length === 0) {
    return emptyView(availableServices);
  }

  const offerIds = offers.map((offer) => offer.id);

  // Collect every serviceId the offers reference so we can batch a single
  // service lookup for cross-references in selectedServices.
  const referencedServiceIds = new Set<string>();
  for (const offer of offers) {
    for (const sid of offer.serviceIds ?? []) referencedServiceIds.add(sid);
    if (offer.service?.id) referencedServiceIds.add(offer.service.id);
    if (offer.masterService?.service.id) referencedServiceIds.add(offer.masterService.service.id);
  }

  const masterServices = referencedServiceIds.size === 0
    ? []
    : await prisma.masterService.findMany({
        where: {
          masterProviderId: input.masterProviderId,
          serviceId: { in: Array.from(referencedServiceIds) },
        },
        select: {
          serviceId: true,
          priceOverride: true,
          durationOverrideMin: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              durationMin: true,
              baseDurationMin: true,
              price: true,
              basePrice: true,
            },
          },
        },
      });

  const services = referencedServiceIds.size === 0
    ? []
    : await prisma.service.findMany({
        where: {
          providerId: input.masterProviderId,
          id: { in: Array.from(referencedServiceIds) },
        },
        select: {
          id: true,
          name: true,
          title: true,
          durationMin: true,
          baseDurationMin: true,
          price: true,
          basePrice: true,
        },
      });

  const serviceLookup = new Map<string, OfferServiceItem>();
  for (const service of services) {
    serviceLookup.set(service.id, {
      id: service.id,
      title: service.title?.trim() || service.name,
      durationMin: service.baseDurationMin ?? service.durationMin,
      regularPrice: service.basePrice ?? service.price,
    });
  }
  for (const ms of masterServices) {
    // Master overrides win over the base service row (they're the price
    // the master actually charges).
    serviceLookup.set(ms.service.id, {
      id: ms.service.id,
      title: ms.service.title?.trim() || ms.service.name,
      durationMin: ms.durationOverrideMin ?? ms.service.baseDurationMin ?? ms.service.durationMin,
      regularPrice: ms.priceOverride ?? ms.service.basePrice ?? ms.service.price,
    });
  }

  const applications = await prisma.modelApplication.findMany({
    where: { offerId: { in: offerIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      offerId: true,
      status: true,
      clientNote: true,
      consentToShoot: true,
      proposedTimeLocal: true,
      confirmedStartAt: true,
      bookingId: true,
      createdAt: true,
      clientUser: {
        select: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  const applicationIds = applications.map((row) => row.id);
  const mediaAssets = applicationIds.length === 0
    ? []
    : await prisma.mediaAsset.findMany({
        where: {
          entityType: "MODEL_APPLICATION",
          entityId: { in: applicationIds },
          kind: "MODEL_APPLICATION_PHOTO",
          deletedAt: null,
        },
        select: { id: true, entityId: true },
        orderBy: { createdAt: "asc" },
      });

  const photosByApplication = new Map<string, ApplicationPhoto[]>();
  for (const asset of mediaAssets) {
    const list = photosByApplication.get(asset.entityId) ?? [];
    const token = createPrivateMediaDeliveryToken({ assetId: asset.id });
    list.push({ id: asset.id, url: buildPrivateMediaDeliveryUrl(asset.id, token) });
    photosByApplication.set(asset.entityId, list);
  }

  // Per-offer counts in one pass, plus offer-by-id lookup for application
  // snapshot population.
  const countsByOffer = new Map<string, OfferApplicationCounts>();
  for (const offerId of offerIds) {
    countsByOffer.set(offerId, {
      total: 0,
      pending: 0,
      approvedWaitingClient: 0,
      confirmed: 0,
      rejected: 0,
    });
  }
  for (const app of applications) {
    const counts = countsByOffer.get(app.offerId);
    if (!counts) continue;
    counts.total += 1;
    if (app.status === ModelApplicationStatus.PENDING) counts.pending += 1;
    else if (app.status === ModelApplicationStatus.APPROVED_WAITING_CLIENT) counts.approvedWaitingClient += 1;
    else if (app.status === ModelApplicationStatus.CONFIRMED) counts.confirmed += 1;
    else if (app.status === ModelApplicationStatus.REJECTED) counts.rejected += 1;
  }

  const offerItems: ActiveOfferItem[] = offers.map((offer) => {
    const primaryServiceId = offer.service?.id ?? offer.masterService?.service.id ?? null;
    const primaryService = primaryServiceId ? serviceLookup.get(primaryServiceId) ?? null : null;
    const fallbackPrimary = primaryService
      ? primaryService
      : (offer.service ?? offer.masterService?.service)
        ? toServiceItem(offer.masterService?.priceOverride ?? null, offer.masterService?.durationOverrideMin ?? null, offer.service ?? offer.masterService!.service)
        : null;

    const selectedServiceIds = uniqueIds([
      ...(offer.serviceIds ?? []),
      ...(primaryServiceId ? [primaryServiceId] : []),
    ]);
    const selectedServices = selectedServiceIds
      .map((sid) => serviceLookup.get(sid))
      .filter((s): s is OfferServiceItem => Boolean(s));

    const offerPriceNumber = decimalToNumber(offer.price);
    const regularPrice = fallbackPrimary?.regularPrice ?? null;
    const discountPct = computeOfferDiscountPct({
      offerPrice: offerPriceNumber,
      servicePrice: regularPrice,
    });

    const counts = countsByOffer.get(offer.id) ?? {
      total: 0,
      pending: 0,
      approvedWaitingClient: 0,
      confirmed: 0,
      rejected: 0,
    };

    return {
      id: offer.id,
      dateLocal: offer.dateLocal,
      timeRangeStartLocal: offer.timeRangeStartLocal,
      timeRangeEndLocal: offer.timeRangeEndLocal,
      offerPrice: offerPriceNumber,
      regularPrice,
      discountPct,
      durationMin: fallbackPrimary?.durationMin ?? 0,
      extraBusyMin: offer.extraBusyMin,
      status: offer.status,
      primaryService: fallbackPrimary,
      selectedServices,
      requirements: offer.requirements ?? [],
      counts,
      conversionRate: computeConversionRate({ total: counts.total, confirmed: counts.confirmed }),
      createdAt: offer.createdAt.toISOString(),
    };
  });

  const activeOffers = offerItems.filter((offer) => offer.status === ACTIVE_STATUS);
  const archivedOffers = offerItems.filter((offer) => offer.status !== ACTIVE_STATUS);

  // Active offers: future dates first (closest to today), then past
  // active leftovers (the master forgot to close them).
  const todayDateKey = formatDateKey(now);
  activeOffers.sort((a, b) => {
    const aFuture = a.dateLocal >= todayDateKey;
    const bFuture = b.dateLocal >= todayDateKey;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return a.dateLocal === b.dateLocal
      ? a.timeRangeStartLocal.localeCompare(b.timeRangeStartLocal)
      : a.dateLocal.localeCompare(b.dateLocal);
  });

  archivedOffers.sort((a, b) => b.dateLocal.localeCompare(a.dateLocal));

  // Pending applications across all offers — newest first.
  const offerById = new Map(offerItems.map((offer) => [offer.id, offer]));
  const validFilter = input.filterOfferId && offerById.has(input.filterOfferId) ? input.filterOfferId : null;

  const pendingAllRaw = applications.filter(
    (app) => app.status === ModelApplicationStatus.PENDING
  );

  const pendingApplications: ApplicationItem[] = pendingAllRaw
    .filter((app) => (validFilter ? app.offerId === validFilter : true))
    .map((app) => {
      const offer = offerById.get(app.offerId);
      return {
        id: app.id,
        status: app.status,
        clientNote: app.clientNote,
        consentToShoot: app.consentToShoot,
        proposedTimeLocal: app.proposedTimeLocal,
        confirmedStartAt: app.confirmedStartAt ? app.confirmedStartAt.toISOString() : null,
        bookingId: app.bookingId,
        createdAt: app.createdAt.toISOString(),
        client: buildClientShape(app.clientUser),
        photos: photosByApplication.get(app.id) ?? [],
        offer: {
          id: app.offerId,
          dateLocal: offer?.dateLocal ?? "",
          timeRangeStartLocal: offer?.timeRangeStartLocal ?? "",
          timeRangeEndLocal: offer?.timeRangeEndLocal ?? "",
          primaryServiceTitle: offer?.primaryService?.title ?? null,
          discountPct: offer?.discountPct ?? null,
        },
      };
    });

  // KPI conversion across all offers, not just active — gives the master
  // a stable "how often do my offers convert" metric, not one that flips
  // every time they archive/close offers.
  const totals = offerItems.reduce(
    (acc, offer) => {
      acc.total += offer.counts.total;
      acc.confirmed += offer.counts.confirmed;
      return acc;
    },
    { total: 0, confirmed: 0 }
  );

  const filterOptions: OfferFilterOption[] = activeOffers
    .filter((offer) => offer.counts.pending > 0)
    .map((offer) => ({
      id: offer.id,
      label: `${offer.dateLocal} · ${offer.timeRangeStartLocal}`,
    }));

  return {
    kpi: {
      activeOffersCount: activeOffers.length,
      pendingApplicationsCount: pendingAllRaw.length,
      conversionRate: computeConversionRate({
        total: totals.total,
        confirmed: totals.confirmed,
      }),
      archivedCount: archivedOffers.length,
    },
    activeOffers,
    pendingApplications,
    archivedOffers,
    filterOptions,
    activeFilterOfferId: validFilter,
    totalPendingBeforeFilter: pendingAllRaw.length,
    availableServices,
  };
}

async function loadAvailableServices(
  masterProviderId: string
): Promise<AvailableServiceForOffer[]> {
  // Solo masters keep services on Provider directly; team masters keep
  // them under MasterService. The create endpoint resolves either id, so
  // we only need to surface the right title + base duration + price.
  const [masterServices, soloServices] = await Promise.all([
    prisma.masterService.findMany({
      where: { masterProviderId, isEnabled: true },
      orderBy: { createdAt: "asc" },
      select: {
        priceOverride: true,
        durationOverrideMin: true,
        service: {
          select: {
            id: true,
            name: true,
            title: true,
            durationMin: true,
            baseDurationMin: true,
            price: true,
            basePrice: true,
            isEnabled: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.service.findMany({
      where: { providerId: masterProviderId, isEnabled: true, isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        baseDurationMin: true,
        price: true,
        basePrice: true,
      },
    }),
  ]);

  const out: AvailableServiceForOffer[] = [];
  const seen = new Set<string>();

  for (const ms of masterServices) {
    if (!ms.service.isEnabled || !ms.service.isActive) continue;
    if (seen.has(ms.service.id)) continue;
    seen.add(ms.service.id);
    out.push({
      id: ms.service.id,
      title: ms.service.title?.trim() || ms.service.name,
      durationMin: ms.durationOverrideMin ?? ms.service.baseDurationMin ?? ms.service.durationMin,
      regularPrice:
        ms.priceOverride ?? ms.service.basePrice ?? ms.service.price,
    });
  }
  for (const service of soloServices) {
    if (seen.has(service.id)) continue;
    seen.add(service.id);
    out.push({
      id: service.id,
      title: service.title?.trim() || service.name,
      durationMin: service.baseDurationMin ?? service.durationMin,
      regularPrice: service.basePrice ?? service.price,
    });
  }

  return out;
}

function emptyView(availableServices: AvailableServiceForOffer[]): MasterModelOffersViewData {
  return {
    kpi: {
      activeOffersCount: 0,
      pendingApplicationsCount: 0,
      conversionRate: null,
      archivedCount: 0,
    },
    activeOffers: [],
    pendingApplications: [],
    archivedOffers: [],
    filterOptions: [],
    activeFilterOfferId: null,
    totalPendingBeforeFilter: 0,
    availableServices,
  };
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function uniqueIds(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function toServiceItem(
  priceOverride: Prisma.Decimal | number | null,
  durationOverrideMin: number | null,
  service: {
    id: string;
    name: string;
    title: string | null;
    durationMin: number;
    baseDurationMin: number | null;
    price: number | null;
    basePrice: number | null;
  }
): OfferServiceItem {
  const price =
    typeof priceOverride === "number"
      ? priceOverride
      : priceOverride
        ? Number(priceOverride)
        : null;
  return {
    id: service.id,
    title: service.title?.trim() || service.name,
    durationMin: durationOverrideMin ?? service.baseDurationMin ?? service.durationMin,
    regularPrice: price ?? service.basePrice ?? service.price,
  };
}

function buildClientShape(user: {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}): ApplicationItem["client"] {
  const displayName =
    user.displayName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.phone ||
    "Клиент";
  const initials = computeInitials(displayName);
  return {
    id: user.id,
    displayName,
    initials,
    avatarSeed: `client:${user.id}`,
  };
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

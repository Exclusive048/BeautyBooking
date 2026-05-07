import { BookingStatus, BookingSource } from "@prisma/client";
import {
  applyProfileNames,
  calculateDaysSinceLastVisit,
  groupBookings,
  type BookingClientRow,
  type ClientAggregate,
} from "@/lib/crm/clients";
import {
  getClientCardData,
  parseClientKeyIdentity,
  type ClientHistoryItem,
} from "@/lib/crm/card-service";
import {
  classifyClient,
  type ClientStatus,
} from "@/lib/master/clients-classifier";
import { prisma } from "@/lib/prisma";

/**
 * Server aggregator for the 27a CRM master surface. Sits on top of the
 * existing `groupBookings` + `getClientCardData` plumbing and adds:
 *   - Per-client computed `statuses[]` (new/regular/vip/sleeping)
 *   - KPI tiles (LTV / frequency / retention / new this month)
 *   - Tab counts per status bucket
 *   - Tab/sort/search filtering applied server-side
 *   - Detail-pane payload for the optional `?id=` selection
 *
 * Two queries per render (in parallel where possible):
 *   - `prisma.booking.findMany` with master scope — feeds `groupBookings`
 *   - `prisma.userProfile.findMany` — fallback contact (email/telegram)
 *     for clients without a phone snapshot
 *
 * The detail query path further calls `getClientCardData` for notes /
 * tags / photos / history, plus a small "next booking" + "active chat"
 * lookup. Cheap on a single-client scope.
 */

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHANGE_REQUESTED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
];

export type ClientsTabId = "all" | "new" | "regular" | "vip" | "sleeping";
export type ClientsSortId = "recent" | "alphabetical" | "ltv_desc";

export type ClientListItemView = {
  key: string;
  clientUserId: string | null;
  displayName: string;
  contact: string | null;
  visitsCount: number;
  totalAmount: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  statuses: ClientStatus[];
};

export type ClientDetailView = {
  key: string;
  clientUserId: string | null;
  displayName: string;
  /** Best-available contact: phone → email → telegram → null. */
  contact: string | null;
  contactLabel: "phone" | "email" | "telegram" | null;
  source: ClientSource;
  firstVisitAt: string | null;
  visitsCount: number;
  totalAmount: number;
  avgCheck: number;
  nextBookingAt: string | null;
  activeBookingId: string | null;
  notes: string | null;
  tags: string[];
  customTags: string[];
  statuses: ClientStatus[];
  recentVisits: ClientHistoryItem[];
  totalHistoryCount: number;
};

export type ClientsKpi = {
  totalCount: number;
  newThisMonthCount: number;
  totalLtv: number;
  avgLtv: number;
  avgFrequency: number;
  retentionPct: number;
};

export type MasterClientsViewData = {
  kpi: ClientsKpi;
  tabCounts: Record<ClientsTabId, number>;
  clients: ClientListItemView[];
  activeTab: ClientsTabId;
  sort: ClientsSortId;
  search: string;
};

export type ClientSource = "marketplace" | "manual" | "unknown";

const VALID_TABS: ReadonlySet<ClientsTabId> = new Set([
  "all",
  "new",
  "regular",
  "vip",
  "sleeping",
]);

const VALID_SORTS: ReadonlySet<ClientsSortId> = new Set([
  "recent",
  "alphabetical",
  "ltv_desc",
]);

export function parseTab(value: string | null | undefined): ClientsTabId {
  return value && VALID_TABS.has(value as ClientsTabId) ? (value as ClientsTabId) : "all";
}

export function parseSort(value: string | null | undefined): ClientsSortId {
  return value && VALID_SORTS.has(value as ClientsSortId) ? (value as ClientsSortId) : "recent";
}

export function parseSearch(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 80);
}

function resolveSource(source: BookingSource | null): ClientSource {
  if (source === BookingSource.WEB || source === BookingSource.APP) return "marketplace";
  if (source === BookingSource.MANUAL) return "manual";
  return "unknown";
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

type ContactInfo = {
  contact: string | null;
  label: ClientDetailView["contactLabel"];
};

async function resolveUserContacts(userIds: string[]): Promise<Map<string, ContactInfo>> {
  if (userIds.length === 0) return new Map();
  const profiles = await prisma.userProfile.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      phone: true,
      email: true,
      telegramUsername: true,
      telegramId: true,
    },
  });
  const map = new Map<string, ContactInfo>();
  for (const profile of profiles) {
    if (profile.phone?.trim()) {
      map.set(profile.id, { contact: profile.phone.trim(), label: "phone" });
      continue;
    }
    if (profile.email?.trim()) {
      map.set(profile.id, { contact: profile.email.trim(), label: "email" });
      continue;
    }
    const tg = profile.telegramUsername?.trim();
    if (tg) {
      map.set(profile.id, { contact: `@${tg}`, label: "telegram" });
      continue;
    }
    if (profile.telegramId) {
      map.set(profile.id, { contact: `Telegram ID: ${profile.telegramId}`, label: "telegram" });
      continue;
    }
    map.set(profile.id, { contact: null, label: null });
  }
  return map;
}

function pickContact(
  aggregate: ClientAggregate,
  userContacts: Map<string, ContactInfo>
): ContactInfo {
  // Phone snapshot from booking always wins when present (cheap + works
  // for guest bookings without a UserProfile).
  if (aggregate.phone && aggregate.phone !== "—") {
    return { contact: aggregate.phone, label: "phone" };
  }
  if (aggregate.clientUserId) {
    const fromUser = userContacts.get(aggregate.clientUserId);
    if (fromUser) return fromUser;
  }
  return { contact: null, label: null };
}

function applySearchFilter(
  list: ClientListItemView[],
  query: string
): ClientListItemView[] {
  if (!query) return list;
  const needle = query.toLowerCase();
  return list.filter((item) => {
    if (item.displayName.toLowerCase().includes(needle)) return true;
    if (item.contact && item.contact.toLowerCase().includes(needle)) return true;
    return false;
  });
}

function applyTabFilter(
  list: ClientListItemView[],
  tab: ClientsTabId
): ClientListItemView[] {
  if (tab === "all") return list;
  return list.filter((item) => item.statuses.includes(tab as ClientStatus));
}

function compareClients(
  left: ClientListItemView,
  right: ClientListItemView,
  sort: ClientsSortId
): number {
  if (sort === "alphabetical") {
    return left.displayName.localeCompare(right.displayName, "ru");
  }
  if (sort === "ltv_desc") {
    return right.totalAmount - left.totalAmount;
  }
  // recent — by lastVisitAt descending; never-visited goes last.
  const leftDate = left.lastVisitAt ? Date.parse(left.lastVisitAt) : -Infinity;
  const rightDate = right.lastVisitAt ? Date.parse(right.lastVisitAt) : -Infinity;
  return rightDate - leftDate;
}

async function loadAggregates(
  providerId: string
): Promise<{
  aggregates: Map<string, ClientAggregate>;
  bookings: BookingClientRow[];
  bookingSources: Map<string, BookingSource>;
}> {
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ providerId }, { masterProviderId: providerId }],
      status: { notIn: [BookingStatus.REJECTED, BookingStatus.NO_SHOW] },
    },
    select: {
      id: true,
      status: true,
      clientUserId: true,
      clientName: true,
      clientPhone: true,
      clientNameSnapshot: true,
      clientPhoneSnapshot: true,
      startAtUtc: true,
      createdAt: true,
      source: true,
      service: { select: { name: true, title: true, price: true } },
      serviceItems: {
        select: { titleSnapshot: true, priceSnapshot: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ startAtUtc: "asc" }, { createdAt: "asc" }],
  });

  // First booking per client → source
  const bookingSources = new Map<string, BookingSource>();
  for (const booking of bookings) {
    const userId = booking.clientUserId;
    const phone = booking.clientPhoneSnapshot ?? booking.clientPhone;
    const key = userId ? `user:${userId}` : phone ? `phone:${phone}` : null;
    if (!key) continue;
    if (!bookingSources.has(key)) bookingSources.set(key, booking.source);
  }

  const aggregates = groupBookings(bookings as unknown as BookingClientRow[]);
  return { aggregates, bookings: bookings as unknown as BookingClientRow[], bookingSources };
}

export async function getMasterClientsView(input: {
  providerId: string;
  timezone: string;
  activeTab: ClientsTabId;
  sort: ClientsSortId;
  search: string;
  now?: Date;
}): Promise<MasterClientsViewData> {
  const now = input.now ?? new Date();
  const { aggregates } = await loadAggregates(input.providerId);

  const userIds = Array.from(
    new Set(
      Array.from(aggregates.values())
        .map((agg) => agg.clientUserId)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [profiles, userContacts] = await Promise.all([
    userIds.length > 0
      ? prisma.userProfile.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    resolveUserContacts(userIds),
  ]);
  applyProfileNames(aggregates, profiles);

  const monthStart = startOfMonth(now);

  const enriched: ClientListItemView[] = Array.from(aggregates.values()).map((agg) => {
    const contact = pickContact(agg, userContacts);
    const statuses = classifyClient(
      {
        visits: agg.visitsCount,
        ltv: agg.totalAmount,
        firstVisitAt: agg.firstVisitAt,
        lastVisitAt: agg.lastVisitAt,
      },
      now
    );
    return {
      key: agg.key,
      clientUserId: agg.clientUserId,
      displayName: agg.displayName,
      contact: contact.contact,
      visitsCount: agg.visitsCount,
      totalAmount: agg.totalAmount,
      lastVisitAt: agg.lastVisitAt ? agg.lastVisitAt.toISOString() : null,
      daysSinceLastVisit: calculateDaysSinceLastVisit(agg.lastVisitAt, input.timezone),
      statuses,
    };
  });

  // KPIs computed against the *full* (unfiltered) population.
  const totalCount = enriched.length;
  const newThisMonthCount = Array.from(aggregates.values()).filter((agg) => {
    if (!agg.firstVisitAt) return false;
    return agg.firstVisitAt.getTime() >= monthStart.getTime();
  }).length;
  const totalLtv = enriched.reduce((sum, item) => sum + item.totalAmount, 0);
  const avgLtv = totalCount > 0 ? Math.round(totalLtv / totalCount) : 0;
  const totalVisits = enriched.reduce((sum, item) => sum + item.visitsCount, 0);
  const avgFrequency = totalCount > 0 ? totalVisits / totalCount : 0;
  const onceVisited = enriched.filter((item) => item.visitsCount >= 1).length;
  const repeatVisited = enriched.filter((item) => item.visitsCount >= 2).length;
  const retentionPct = onceVisited > 0 ? Math.round((repeatVisited / onceVisited) * 100) : 0;

  const tabCounts: Record<ClientsTabId, number> = {
    all: totalCount,
    new: 0,
    regular: 0,
    vip: 0,
    sleeping: 0,
  };
  for (const item of enriched) {
    for (const status of item.statuses) {
      tabCounts[status] += 1;
    }
  }

  // Mention `userContacts` so the type narrowing carries through after we
  // dropped the inline detail derivation that used it. Detail data is now
  // resolved separately via `getMasterClientDetail` to keep the URL clean
  // of `?id=`.
  void userContacts;

  const filtered = applySearchFilter(applyTabFilter(enriched, input.activeTab), input.search);
  filtered.sort((left, right) => compareClients(left, right, input.sort));

  return {
    kpi: {
      totalCount,
      newThisMonthCount,
      totalLtv,
      avgLtv,
      avgFrequency,
      retentionPct,
    },
    tabCounts,
    clients: filtered,
    activeTab: input.activeTab,
    sort: input.sort,
    search: input.search,
  };
}

/**
 * Single-client variant. Backs the `/api/master/clients/[clientKey]/detail`
 * endpoint that the client-side detail pane fetches lazily after a row
 * click. We avoid pulling every booking just to display one client's
 * card — the inner Prisma query is pre-filtered by `clientFilter`, so the
 * cost scales with the client's own booking history (typically 1-50 rows).
 *
 * Returns null when the client doesn't belong to this master — the client
 * pane uses that to render an error state without leaking other masters'
 * data.
 */
export async function getMasterClientDetail(input: {
  providerId: string;
  timezone: string;
  clientKey: string;
  now?: Date;
}): Promise<ClientDetailView | null> {
  const now = input.now ?? new Date();
  const { identity, phoneVariants } = parseClientKeyIdentity(input.clientKey);
  const clientFilter = identity.clientUserId
    ? { clientUserId: identity.clientUserId }
    : {
        OR: [
          { clientPhone: { in: phoneVariants } },
          { clientPhoneSnapshot: { in: phoneVariants } },
        ],
      };

  const bookings = await prisma.booking.findMany({
    where: {
      AND: [
        { OR: [{ providerId: input.providerId }, { masterProviderId: input.providerId }] },
        { status: { notIn: [BookingStatus.REJECTED, BookingStatus.NO_SHOW] } },
        clientFilter,
      ],
    },
    select: {
      id: true,
      status: true,
      clientUserId: true,
      clientName: true,
      clientPhone: true,
      clientNameSnapshot: true,
      clientPhoneSnapshot: true,
      startAtUtc: true,
      createdAt: true,
      service: { select: { name: true, title: true, price: true } },
      serviceItems: {
        select: { titleSnapshot: true, priceSnapshot: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ startAtUtc: "asc" }, { createdAt: "asc" }],
  });

  if (bookings.length === 0) return null;

  const aggregates = groupBookings(bookings as unknown as BookingClientRow[]);
  const aggregate = aggregates.get(input.clientKey);
  if (!aggregate) return null;

  const userIds = aggregate.clientUserId ? [aggregate.clientUserId] : [];
  const [profiles, userContacts] = await Promise.all([
    userIds.length > 0
      ? prisma.userProfile.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    resolveUserContacts(userIds),
  ]);
  applyProfileNames(aggregates, profiles);

  return buildSelectedClient({
    aggregate,
    providerId: input.providerId,
    timezone: input.timezone,
    userContacts,
    statuses: classifyClient(
      {
        visits: aggregate.visitsCount,
        ltv: aggregate.totalAmount,
        firstVisitAt: aggregate.firstVisitAt,
        lastVisitAt: aggregate.lastVisitAt,
      },
      now
    ),
  });
}

async function buildSelectedClient(input: {
  aggregate: ClientAggregate;
  providerId: string;
  timezone: string;
  userContacts: Map<string, ContactInfo>;
  statuses: ClientStatus[];
}): Promise<ClientDetailView> {
  const { aggregate } = input;
  const cardData = await getClientCardData({
    providerId: input.providerId,
    timeZone: input.timezone,
    bookingWhere: {
      OR: [{ providerId: input.providerId }, { masterProviderId: input.providerId }],
    },
    clientKey: aggregate.key,
  });

  const contact = pickContact(aggregate, input.userContacts);

  // Find the next active booking for this client (chat link + nextBookingAt).
  const { identity, phoneVariants } = parseClientKeyIdentity(aggregate.key);
  const clientFilter = identity.clientUserId
    ? { clientUserId: identity.clientUserId }
    : {
        OR: [
          { clientPhone: { in: phoneVariants } },
          { clientPhoneSnapshot: { in: phoneVariants } },
        ],
      };
  const upcoming = await prisma.booking.findFirst({
    where: {
      AND: [
        { OR: [{ providerId: input.providerId }, { masterProviderId: input.providerId }] },
        clientFilter,
        { status: { in: ACTIVE_BOOKING_STATUSES } },
        { startAtUtc: { gt: new Date() } },
      ],
    },
    orderBy: { startAtUtc: "asc" },
    select: { id: true, startAtUtc: true, source: true },
  });

  // Source = first ever booking's source (across status). One extra cheap query.
  const firstBooking = await prisma.booking.findFirst({
    where: {
      AND: [
        { OR: [{ providerId: input.providerId }, { masterProviderId: input.providerId }] },
        clientFilter,
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { source: true },
  });

  const recentVisits = cardData.history
    .filter((row) => row.status === BookingStatus.FINISHED)
    .slice(0, 3);

  const avgCheck =
    aggregate.visitsCount > 0 ? Math.round(aggregate.totalAmount / aggregate.visitsCount) : 0;

  return {
    key: aggregate.key,
    clientUserId: aggregate.clientUserId,
    displayName: aggregate.displayName,
    contact: contact.contact,
    contactLabel: contact.label,
    source: resolveSource(firstBooking?.source ?? null),
    firstVisitAt: aggregate.firstVisitAt ? aggregate.firstVisitAt.toISOString() : null,
    visitsCount: aggregate.visitsCount,
    totalAmount: aggregate.totalAmount,
    avgCheck,
    nextBookingAt: upcoming?.startAtUtc ? upcoming.startAtUtc.toISOString() : null,
    activeBookingId: upcoming?.id ?? null,
    notes: cardData.card.notes,
    tags: cardData.card.tags,
    customTags: cardData.card.tags,
    statuses: input.statuses,
    recentVisits,
    totalHistoryCount: cardData.history.length,
  };
}

import type { BookingCancelledBy, BookingStatus, Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversationSlug } from "@/lib/chat/conversation-slug";
import { BOOKING_CHANGE_REQUEST_LIMIT } from "@/lib/bookings/flow";
import { resolveVisitAddress } from "@/lib/bookings/visit-address";
import { canLeaveReview, reviewWindowFor } from "@/lib/reviews/can-leave";
import { classifyClientBookingGroup } from "@/lib/client-cabinet/booking-classification";
import { toLocalDateKey } from "@/lib/schedule/timezone";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export type ClientBookingFilter = {
  status?: "all" | "upcoming" | "finished" | "cancelled";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ClientBookingDTO = {
  id: string;
  status: BookingStatus;
  /** MOBILE-CLIENT-01: момент создания записи (UTC ISO) — от него считается
   * автоотмена неподтверждённой записи (`expire-pending.ts`). */
  createdAt: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  durationMin: number;
  slotLabel: string;
  isUpcoming: boolean;
  isFinished: boolean;
  isCancelled: boolean;
  isToday: boolean;
  canReview: boolean;
  hasReview: boolean;
  /**
   * MOBILE-CLIENT-01: конец окна отзыва (UTC ISO) — то же правило, что
   * `reviewWindowFor` / `canReview`. `null`, когда отзыв по записи уже не
   * появится: отзыв есть (в том числе удалённый), запись отменена, окно прошло.
   * У будущей записи — конец её будущего окна.
   */
  reviewDeadlineUtc: string | null;
  /**
   * Чат — только у записей к мастеру (`provider.type === MASTER`): переписка
   * ключуется записанным провайдером, а список диалогов и счётчик непрочитанных
   * студийные записи не показывают (`conversation-aggregator.ts`; чат студии —
   * открытый продуктовый вопрос, BACKLOG, инв. #26). У студийной записи `null`.
   */
  chatSlug: string | null;
  /**
   * RESCHEDULE-CLIENT-APPROVAL: двустороннее согласование переноса (инв. #32).
   * `proposedStartAt`/`proposedEndAt` — предложенное окно (только при
   * CHANGE_REQUESTED), `actionRequiredBy` — чей сейчас ход: `CLIENT` — мастер
   * предложил и ждёт ответа клиента, `MASTER` — клиент попросил и ждёт мастера.
   */
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /** MOBILE-CLIENT-01: комментарий мастера к предложенному им переносу — только
   * при CHANGE_REQUESTED (клиентский запрос переноса комментарий не пишет). */
  changeComment: string | null;
  /** MOBILE-CLIENT-01: сколько раз клиент уже просил перенос и предел
   * (`BOOKING_CHANGE_REQUEST_LIMIT`): при `count >= limit` перенос — 409. */
  clientChangeRequestsCount: number;
  changeRequestLimit: number;
  /**
   * PACKAGE-CANCEL-UI-01: услуга входит в пакет. Пакет отменяется только
   * целиком (инв. #34), и отмена отдельной услуги отвечает 409 — поверхности
   * нужно знать об этом заранее, чтобы предложить отмену пакета.
   */
  bookingPackageId: string | null;
  /** MOBILE-CLIENT-01: кто отменил — только у отменённой записи. */
  cancelledBy: BookingCancelledBy | null;
  /**
   * DEV-SCENARIO-01: причина, которую мастер или студия обязаны указать при
   * отмене, — адресована клиенту. Только при отмене стороной провайдера: свою
   * причину клиент знает, у системной отмены её нет.
   */
  cancelReason: string | null;
  /**
   * MOBILE-CLIENT-01: срок бесплатной отмены записанного провайдера (у
   * студийной записи — студии), часы до начала; `null` — срока нет (значение
   * не задано или ≤ 0). Та же колонка, что проверяет `ensureCancellationDeadline`.
   */
  cancellationDeadlineHours: number | null;
  /** MOBILE-CLIENT-01: комментарий самого клиента к записи и «помолчать». */
  comment: string | null;
  silentMode: boolean;
  /** Maps action shows when address exists and viewing is master-on-site */
  isOnSite: boolean;
  /** B2: первый непустой из адреса мастера и адреса записанного провайдера. */
  address: string | null;
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    type: ProviderType;
    avatarUrl: string | null;
    /** QA-107/FIX-22: salon (entity) timezone — client surfaces render the time
     * in THIS zone, never the viewer's host tz, with an explicit zone label. */
    timezone: string;
  };
  /**
   * MOBILE-CLIENT-01 (G4): студия, через которую записались, когда `provider` —
   * профиль мастера в ней. `null` у записи к мастеру и у студийной записи без
   * назначенного мастера (тогда `provider` — сама студия). `id` — `Provider.id`
   * студии (кабинетная поверхность, правило 12 не действует).
   */
  studio: {
    id: string;
    name: string;
    publicUsername: string | null;
    address: string | null;
  } | null;
  service: {
    id: string;
    name: string;
    priceSnapshot: number;
    durationSnapshotMin: number;
  };
};

export type ClientBookingsKpi = {
  totalCount: number;
  upcomingNext: {
    whenIso: string;
    providerName: string;
    serviceName: string;
    // FIX-20 (Item 2): salon tz so the «Ближайшая» tile renders the salon-tz
    // time + relative day (matching the list), not the viewer/host tz.
    timeZone: string;
  } | null;
  finishedCount: number;
  spentLast90dKopeks: number;
};

export type ClientBookingsPayload = {
  bookings: ClientBookingDTO[];
  kpi: ClientBookingsKpi;
};

const CLIENT_BOOKING_PROVIDER_SELECT = {
  id: true,
  name: true,
  publicUsername: true,
  type: true,
  avatarUrl: true,
  address: true,
  timezone: true,
  cancellationDeadlineHours: true,
} as const satisfies Prisma.ProviderSelect;

/**
 * MOBILE-CLIENT-01: одна выборка и один маппер на список «Мои записи» и на
 * карточку одной записи (`GET /api/cabinet/user/bookings/{id}`) — форма
 * элемента не может разойтись.
 */
const CLIENT_BOOKING_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  startAtUtc: true,
  endAtUtc: true,
  proposedStartAt: true,
  proposedEndAt: true,
  actionRequiredBy: true,
  changeComment: true,
  clientChangeRequestsCount: true,
  bookingPackageId: true,
  cancelledBy: true,
  cancelReason: true,
  comment: true,
  silentMode: true,
  slotLabel: true,
  providerId: true,
  service: {
    select: { id: true, name: true, price: true, durationMin: true },
  },
  provider: { select: CLIENT_BOOKING_PROVIDER_SELECT },
  masterProvider: { select: CLIENT_BOOKING_PROVIDER_SELECT },
  serviceItems: {
    select: { titleSnapshot: true, priceSnapshot: true, durationSnapshotMin: true },
    take: 1,
  },
  review: { select: { id: true } },
} as const satisfies Prisma.BookingSelect;

type ClientBookingRow = Prisma.BookingGetPayload<{ select: typeof CLIENT_BOOKING_SELECT }>;

/**
 * B3: ключ переписки — записанный провайдер (`Booking.providerId`), как у
 * `resolveConversationAccess`, и только у записи к мастеру: студийные записи
 * в мессенджер не попадают (`listConversations` пропускает провайдеров не
 * MASTER). Раньше слаг создавался по `providerId`, а искался по отображаемому
 * мастеру — у студийной записи с мастером он не находился «случайно», а у
 * студийной записи без мастера находился и вёл в переписку, которой нет ни в
 * одном списке.
 */
function chatProviderIdFor(row: Pick<ClientBookingRow, "providerId" | "provider">): string | null {
  return row.provider.type === "MASTER" ? row.providerId : null;
}

/** One round trip per unique providerId so a long history with the same master
 * only pays once. Lazily creates `ConversationSlug` rows (this GET can write). */
async function resolveChatSlugs(
  rows: ReadonlyArray<Pick<ClientBookingRow, "providerId" | "provider">>,
  userId: string,
): Promise<Map<string, string>> {
  const providerIds = Array.from(
    new Set(rows.map(chatProviderIdFor).filter((id): id is string => id !== null)),
  );
  const slugByProvider = new Map<string, string>();
  await Promise.all(
    providerIds.map(async (providerId) => {
      try {
        const slug = await getOrCreateConversationSlug({ providerId, clientUserId: userId });
        slugByProvider.set(providerId, slug);
      } catch {
        /* swallow — chat link just hides if slug fails */
      }
    }),
  );
  return slugByProvider;
}

function toClientBookingDto(
  r: ClientBookingRow,
  ctx: { userId: string; now: Date; chatSlugs: ReadonlyMap<string, string> },
): ClientBookingDTO {
  const { userId, now } = ctx;
  // For studio bookings the customer-facing provider in chat/profile is the
  // master who'll actually do the work — fall back to the studio provider
  // when no master is assigned yet (NEW/PENDING).
  const displayProvider = r.masterProvider ?? r.provider;
  // Salon tz of the master who'll do the work (falls back to the booked
  // provider). Drives QA-107 salon-tz rendering + zone label.
  const salonTz = displayProvider.timezone ?? r.provider.timezone;
  const start = r.startAtUtc;
  const end = r.endAtUtc;
  // FIX-EXP-013: datetime-aware classification via the canonical
  // runtime-finished cutoff — an elapsed-but-not-FINISHED booking is history,
  // not "upcoming". Reuses `resolveBookingRuntimeStatus` (same predicate as
  // canReview / can-leave); instant-based, so the entity-tz is irrelevant here.
  const group = classifyClientBookingGroup({
    status: r.status,
    startAtUtc: start,
    endAtUtc: end,
    now,
  });
  // FIX-20 (Item 2): "today" in the SALON's tz (not host/server tz) so the
  // «Сегодня» badge/highlight matches the salon-tz time shown in the list.
  const isToday =
    !!start && toLocalDateKey(start, salonTz) === toLocalDateKey(now, salonTz);
  const serviceItem = r.serviceItems[0];
  const titleSnapshot = serviceItem?.titleSnapshot ?? r.service.name;
  const priceSnapshot = serviceItem?.priceSnapshot ?? r.service.price;
  const durationSnapshotMin = serviceItem?.durationSnapshotMin ?? r.service.durationMin;
  const hasReview = !!r.review;
  const isFinished = group === "finished";
  const reviewBooking = {
    clientUserId: userId,
    status: r.status,
    startAtUtc: start,
    endAtUtc: end,
    service: { durationMin: r.service.durationMin },
  };
  // FIX-R2-06-H: mirror the server can-leave gate exactly (runtime-FINISHED +
  // REVIEW_WINDOW_DAYS), so the button shows iff the server would 201.
  const canReview =
    !hasReview &&
    canLeaveReview({
      booking: reviewBooking,
      currentUserId: userId,
      nowUtc: now,
    });
  // MOBILE-CLIENT-01: то же окно, что у `canReview` (`reviewWindowFor`).
  const reviewWindow = hasReview ? null : reviewWindowFor(reviewBooking);
  const reviewDeadlineUtc =
    reviewWindow && now <= reviewWindow.deadline ? reviewWindow.deadline.toISOString() : null;

  // B2: `??` на NOT NULL колонке не срабатывал — у студийной записи был `""`.
  const address = resolveVisitAddress(displayProvider.address, r.provider.address);
  const isChangeRequested = r.status === "CHANGE_REQUESTED";
  const deadlineHours = r.provider.cancellationDeadlineHours;
  const chatProviderId = chatProviderIdFor(r);

  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    startAtUtc: start?.toISOString() ?? null,
    endAtUtc: end?.toISOString() ?? null,
    durationMin: durationSnapshotMin,
    slotLabel: r.slotLabel,
    isUpcoming: group === "upcoming",
    isFinished,
    isCancelled: group === "cancelled",
    isToday,
    canReview,
    hasReview,
    reviewDeadlineUtc,
    chatSlug: chatProviderId ? (ctx.chatSlugs.get(chatProviderId) ?? null) : null,
    proposedStartAt:
      isChangeRequested && r.proposedStartAt ? r.proposedStartAt.toISOString() : null,
    proposedEndAt:
      isChangeRequested && r.proposedEndAt ? r.proposedEndAt.toISOString() : null,
    actionRequiredBy: isChangeRequested ? (r.actionRequiredBy ?? null) : null,
    changeComment: isChangeRequested ? r.changeComment?.trim() || null : null,
    clientChangeRequestsCount: r.clientChangeRequestsCount,
    changeRequestLimit: BOOKING_CHANGE_REQUEST_LIMIT,
    bookingPackageId: r.bookingPackageId ?? null,
    cancelledBy: group === "cancelled" ? (r.cancelledBy ?? null) : null,
    cancelReason:
      group === "cancelled" && r.cancelledBy === "PROVIDER" ? r.cancelReason?.trim() || null : null,
    cancellationDeadlineHours:
      typeof deadlineHours === "number" && deadlineHours > 0 ? deadlineHours : null,
    comment: r.comment?.trim() || null,
    silentMode: r.silentMode,
    isOnSite: !!address,
    address,
    provider: {
      id: displayProvider.id,
      name: displayProvider.name,
      publicUsername: displayProvider.publicUsername,
      type: displayProvider.type,
      avatarUrl: displayProvider.avatarUrl,
      timezone: salonTz,
    },
    studio:
      r.provider.type === "STUDIO" && r.masterProvider && r.masterProvider.id !== r.provider.id
        ? {
            id: r.provider.id,
            name: r.provider.name,
            publicUsername: r.provider.publicUsername,
            address: resolveVisitAddress(r.provider.address),
          }
        : null,
    service: {
      id: r.service.id,
      name: titleSnapshot,
      priceSnapshot,
      durationSnapshotMin,
    },
  };
}

/**
 * MOBILE-CLIENT-01 (G1) — одна запись клиента для карточки записи в
 * приложении (push ведёт на `/bookings/{id}`). Чужая и несуществующая запись
 * неразличимы — `null` (роут отвечает 404), существование чужой брони не
 * раскрывается. Форма — ровно элемент `listClientBookings`.
 */
export async function getClientBooking(
  userId: string,
  bookingId: string,
): Promise<ClientBookingDTO | null> {
  const row = await prisma.booking.findFirst({
    where: { id: bookingId, clientUserId: userId },
    select: CLIENT_BOOKING_SELECT,
  });
  if (!row) return null;
  const chatSlugs = await resolveChatSlugs([row], userId);
  return toClientBookingDto(row, { userId, now: new Date(), chatSlugs });
}

export async function listClientBookings(
  userId: string,
  filter: ClientBookingFilter = {},
): Promise<ClientBookingsPayload> {
  const now = new Date();
  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  const rows = await prisma.booking.findMany({
    where: { clientUserId: userId },
    orderBy: { startAtUtc: "desc" },
    take: 300,
    select: CLIENT_BOOKING_SELECT,
  });

  const chatSlugs = await resolveChatSlugs(rows, userId);
  const dtos: ClientBookingDTO[] = rows.map((r) => toClientBookingDto(r, { userId, now, chatSlugs }));

  // Filter
  const filtered = dtos.filter((b) => {
    if (filter.status && filter.status !== "all") {
      if (filter.status === "upcoming" && !b.isUpcoming) return false;
      if (filter.status === "finished" && !b.isFinished) return false;
      if (filter.status === "cancelled" && !b.isCancelled) return false;
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const hay = `${b.provider.name} ${b.service.name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter.dateFrom && b.startAtUtc) {
      if (new Date(b.startAtUtc) < new Date(filter.dateFrom)) return false;
    }
    if (filter.dateTo && b.startAtUtc) {
      if (new Date(b.startAtUtc) > new Date(filter.dateTo)) return false;
    }
    return true;
  });

  // Sort: upcoming ASC by start, then finished DESC, cancelled last by start DESC
  filtered.sort((a, b) => {
    const groupA = a.isUpcoming ? 0 : a.isFinished ? 1 : 2;
    const groupB = b.isUpcoming ? 0 : b.isFinished ? 1 : 2;
    if (groupA !== groupB) return groupA - groupB;
    const aTime = a.startAtUtc ? new Date(a.startAtUtc).getTime() : 0;
    const bTime = b.startAtUtc ? new Date(b.startAtUtc).getTime() : 0;
    if (a.isUpcoming) return aTime - bTime;
    return bTime - aTime;
  });

  // KPI — compute over the unfiltered set
  const upcomingDtos = dtos
    .filter((b) => b.isUpcoming && b.startAtUtc && new Date(b.startAtUtc) >= now)
    .sort(
      (a, b) =>
        new Date(a.startAtUtc!).getTime() - new Date(b.startAtUtc!).getTime(),
    );
  const finishedCount = dtos.filter((b) => b.isFinished).length;
  const spentLast90dKopeks = dtos
    .filter(
      (b) =>
        b.isFinished &&
        b.startAtUtc &&
        new Date(b.startAtUtc) >= ninetyDaysAgo,
    )
    .reduce((sum, b) => sum + b.service.priceSnapshot, 0);

  const upcomingNext = upcomingDtos[0]
    ? {
        whenIso: upcomingDtos[0].startAtUtc!,
        providerName: upcomingDtos[0].provider.name,
        serviceName: upcomingDtos[0].service.name,
        timeZone: upcomingDtos[0].provider.timezone,
      }
    : null;

  const kpi: ClientBookingsKpi = {
    totalCount: dtos.length,
    upcomingNext,
    finishedCount,
    spentLast90dKopeks,
  };

  return { bookings: filtered, kpi };
}

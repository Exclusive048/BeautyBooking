import "server-only";

import { BookingStatus, ProviderType, type BookingCancelledBy, type Prisma } from "@prisma/client";
import { buildPhoneVariantsForMatch } from "@/lib/bookings/link-guest-bookings";
import { BOOKING_CHANGE_REQUEST_LIMIT } from "@/lib/bookings/flow";
import { buildClientKey } from "@/lib/crm/client-key";
import { CLIENT_STATUS_THRESHOLDS } from "@/lib/master/clients-classifier";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { encodePublicId } from "@/lib/public-id";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";
import { mapProposedReschedule } from "@/features/studio-cabinet/schedule/lib/reschedule-decision";
import { toStudioBookingListItem, type StudioBookingListItem } from "./booking-json";

/**
 * MOBILE-STUDIO-C (ops) — карточка одной записи студии для приложения
 * (`GET /api/cabinet/studio/bookings/{id}`): всё из элемента журнала плюс
 * телефон и ключ CRM клиента, комментарий, заметка студии, ответы на вопросы,
 * история переносов и отмены, отзыв.
 *
 * Запись — только студийная (`studioBookingsWhere`): личная запись мастера,
 * чужая и несуществующая неразличимы (`null` → 404), как у карточки мастера.
 * Следа чтения ПДн не пишем — карточка мастера его тоже не пишет: это одна
 * запись, а не перечисление клиентской базы.
 */

/** Те же статусы, что считает журнал (`listStudioBookings`) для «новый» / VIP. */
const COUNTED_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
];

const DETAIL_SELECT = {
  id: true,
  status: true,
  source: true,
  startAtUtc: true,
  endAtUtc: true,
  createdAt: true,
  proposedStartAt: true,
  proposedEndAt: true,
  requestedBy: true,
  actionRequiredBy: true,
  changeComment: true,
  bookingPackageId: true,
  providerId: true,
  masterProviderId: true,
  serviceId: true,
  clientUserId: true,
  clientName: true,
  clientPhone: true,
  clientPhoneSnapshot: true,
  clientUser: { select: { externalPhotoUrl: true } },
  comment: true,
  notes: true,
  silentMode: true,
  bookingAnswers: true,
  clientChangeRequestsCount: true,
  masterChangeRequestsCount: true,
  cancelledBy: true,
  cancelReason: true,
  cancelledAtUtc: true,
  service: { select: { name: true, title: true, price: true, durationMin: true } },
  serviceItems: {
    select: { titleSnapshot: true, priceSnapshot: true, durationSnapshotMin: true },
    orderBy: { createdAt: "asc" },
  },
  review: {
    select: {
      id: true,
      rating: true,
      text: true,
      replyText: true,
      repliedAt: true,
      createdAt: true,
      deletedAt: true,
      targetType: true,
      targetId: true,
    },
  },
} satisfies Prisma.BookingSelect;

type DetailRow = Prisma.BookingGetPayload<{ select: typeof DETAIL_SELECT }>;

export type StudioBookingDetail = Omit<StudioBookingListItem, "client"> & {
  createdAt: string;
  requestedBy: "CLIENT" | "MASTER" | null;
  changeComment: string | null;
  client: {
    name: string;
    /** Телефон из записи (нормализованный, если разбирается); `null` — не оставлен. */
    phone: string | null;
    userId: string | null;
    /** Ключ CRM студии (`/api/studio/clients/{key}/card`); `null` — ни аккаунта, ни телефона. */
    key: string | null;
    avatarUrl: string | null;
    isNewClient: boolean;
    isVip: boolean;
    /** Прошедших визитов клиента в студию (не отменённых и не неявок). */
    pastVisitsCount: number;
  };
  /** Услуги записи по снимку на момент записи; цена — копейки. */
  services: Array<{ title: string; price: number; durationMin: number }>;
  /** Комментарий клиента. */
  comment: string | null;
  /** Заметка студии, оставленная при ручном создании записи. */
  notes: string | null;
  silentMode: boolean;
  answers: Array<{ question: string; answer: string }>;
  clientChangeRequestsCount: number;
  masterChangeRequestsCount: number;
  changeRequestLimit: number;
  cancelledBy: BookingCancelledBy | null;
  cancelReason: string | null;
  cancelledAtUtc: string | null;
  review: {
    /** Публичный токен отзыва — для `/api/reviews/{id}/reply`. */
    id: string;
    rating: number;
    text: string | null;
    replyText: string | null;
    repliedAt: string | null;
    createdAt: string;
    canReply: boolean;
  } | null;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function priceKopeksOf(row: DetailRow): number {
  const snapshotSum = row.serviceItems.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, row.service.price);
}

function serviceLines(row: DetailRow): StudioBookingDetail["services"] {
  if (row.serviceItems.length > 0) {
    return row.serviceItems.map((item) => ({
      title: item.titleSnapshot,
      price: item.priceSnapshot,
      durationMin: item.durationSnapshotMin,
    }));
  }
  return [
    {
      title: row.service.title?.trim() || row.service.name,
      price: row.service.price,
      durationMin: row.service.durationMin,
    },
  ];
}

function parseAnswers(value: Prisma.JsonValue | null): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  const answers: Array<{ question: string; answer: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const question = (entry as Record<string, unknown>).questionText;
    const answer = (entry as Record<string, unknown>).answer;
    if (typeof question === "string" && typeof answer === "string" && answer.trim()) {
      answers.push({ question, answer });
    }
  }
  return answers;
}

function rawPhoneOf(row: DetailRow): string | null {
  return row.clientPhoneSnapshot?.trim() || row.clientPhone?.trim() || null;
}

function clientKeyOf(clientUserId: string | null, phone: string | null): string | null {
  try {
    return buildClientKey({ clientUserId, clientPhone: phone }).key;
  } catch {
    // Ни аккаунта, ни разбираемого телефона — CRM-карточки у такой записи нет.
    return null;
  }
}

/**
 * Визиты клиента в студию — тем же правилом, что журнал (`clientKeyOf` там):
 * клиент с аккаунтом — по аккаунту, гость — по телефону среди записей без аккаунта.
 */
async function loadClientStudioStats(
  studioId: string,
  row: DetailRow,
  now: Date,
): Promise<{ countedVisits: number; revenueKopeks: number; pastVisits: number }> {
  let clientWhere: Prisma.BookingWhereInput | null = null;
  if (row.clientUserId) {
    clientWhere = { clientUserId: row.clientUserId };
  } else {
    const raw = rawPhoneOf(row);
    const variants = raw ? buildPhoneVariantsForMatch(raw).variants : [];
    if (variants.length > 0) {
      clientWhere = {
        clientUserId: null,
        OR: [{ clientPhoneSnapshot: { in: variants } }, { clientPhone: { in: variants } }],
      };
    }
  }
  if (!clientWhere) return { countedVisits: 0, revenueKopeks: 0, pastVisits: 0 };

  const bookings = await prisma.booking.findMany({
    where: { AND: [studioBookingsWhere(studioId), clientWhere, { status: { in: COUNTED_STATUSES } }] },
    select: {
      startAtUtc: true,
      service: { select: { price: true } },
      serviceItems: { select: { priceSnapshot: true } },
    },
  });
  let revenueKopeks = 0;
  let pastVisits = 0;
  for (const booking of bookings) {
    const snapshotSum = booking.serviceItems.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
    revenueKopeks += snapshotSum > 0 ? snapshotSum : Math.max(0, booking.service?.price ?? 0);
    if (booking.startAtUtc && booking.startAtUtc.getTime() < now.getTime()) pastVisits += 1;
  }
  return { countedVisits: bookings.length, revenueKopeks, pastVisits };
}

/**
 * Может ли администратор студии ответить на отзыв — то же правило, что у
 * `POST /api/reviews/{id}/reply` (`ensureMasterReviewAccess`): отзыв о студии
 * или о мастере, который сейчас в этой студии.
 */
async function canStudioReply(
  review: { targetType: string; targetId: string },
  studioProviderId: string,
): Promise<boolean> {
  if (review.targetType === "studio") return review.targetId === studioProviderId;
  if (review.targetType !== "provider") return false;
  const target = await prisma.provider.findUnique({
    where: { id: review.targetId },
    select: { type: true, studioId: true },
  });
  return target?.type === ProviderType.MASTER && target.studioId === studioProviderId;
}

export async function getStudioBookingDetail(input: {
  studioId: string;
  studioProviderId: string;
  bookingId: string;
  now?: Date;
}): Promise<StudioBookingDetail | null> {
  const now = input.now ?? new Date();
  const row = await prisma.booking.findFirst({
    where: { AND: [{ id: input.bookingId }, studioBookingsWhere(input.studioId)] },
    select: DETAIL_SELECT,
  });
  if (!row) return null;

  const performerId = row.masterProviderId ?? row.providerId;
  const review = row.review && row.review.deletedAt === null ? row.review : null;
  const [performer, stats, canReply] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: performerId },
      select: { name: true, avatarUrl: true, tagline: true },
    }),
    loadClientStudioStats(input.studioId, row, now),
    review ? canStudioReply(review, input.studioProviderId) : Promise.resolve(false),
  ]);

  const rawPhone = rawPhoneOf(row);
  const phone = rawPhone ? normalizeRussianPhone(rawPhone) ?? rawPhone : null;
  const isNewClient = stats.countedVisits <= 1;
  const isVip = stats.revenueKopeks >= CLIENT_STATUS_THRESHOLDS.VIP_LTV_KOPEKS;

  const item = toStudioBookingListItem(
    {
      id: row.id,
      startAtUtc: row.startAtUtc?.toISOString() ?? new Date(0).toISOString(),
      endAtUtc: row.endAtUtc?.toISOString() ?? new Date(0).toISOString(),
      master: {
        id: performerId,
        displayName: performer?.name ?? "—",
        avatarUrl: performer?.avatarUrl ?? null,
        specialization: performer?.tagline ?? "",
      },
      client: { displayName: row.clientName || "—", phone: null, isNewClient, isVip },
      serviceId: row.serviceId,
      service: {
        name: row.service.title?.trim() || row.service.name || "Услуга",
        durationMin: row.service.durationMin,
      },
      priceKopeks: priceKopeksOf(row),
      source: row.source,
      status: row.status,
      ...mapProposedReschedule(row),
      bookingPackageId: row.bookingPackageId,
    },
    now,
  );

  return {
    ...item,
    createdAt: row.createdAt.toISOString(),
    requestedBy: row.requestedBy ?? null,
    changeComment: row.changeComment?.trim() || null,
    client: {
      name: item.client.name,
      phone,
      userId: row.clientUserId,
      key: clientKeyOf(row.clientUserId, phone),
      avatarUrl: row.clientUserId ? row.clientUser?.externalPhotoUrl ?? null : null,
      isNewClient,
      isVip,
      pastVisitsCount: stats.pastVisits,
    },
    services: serviceLines(row),
    comment: row.comment?.trim() || null,
    notes: row.notes?.trim() || null,
    silentMode: row.silentMode,
    answers: parseAnswers(row.bookingAnswers),
    clientChangeRequestsCount: row.clientChangeRequestsCount,
    masterChangeRequestsCount: row.masterChangeRequestsCount,
    changeRequestLimit: BOOKING_CHANGE_REQUEST_LIMIT,
    cancelledBy: row.cancelledBy ?? null,
    cancelReason: row.cancelReason?.trim() || null,
    cancelledAtUtc: iso(row.cancelledAtUtc),
    review: review
      ? {
          id: encodePublicId(review.id),
          rating: review.rating,
          text: review.text,
          replyText: review.replyText,
          repliedAt: iso(review.repliedAt),
          createdAt: review.createdAt.toISOString(),
          canReply,
        }
      : null,
  };
}

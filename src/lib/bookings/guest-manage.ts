import "server-only";
import { AppError, resolveErrorCode } from "@/lib/api/errors";
import { cancelBooking } from "@/lib/bookings/cancelBooking";
import {
  canCancelBookingStatus,
  resolveBookingRuntimeStatus,
  type BookingRuntimeStatus,
} from "@/lib/bookings/flow";
import { guestManagePath, signGuestManageToken, verifyGuestManageToken } from "@/lib/bookings/guest-manage-token";
import { cancelSoloPackageBooking } from "@/lib/bookings/package-booking";
import { enqueueSlotFreedJob } from "@/lib/bookings/slot-freed-enqueue";
import { rescheduleBooking } from "@/lib/bookings/usecases";
import { isGuestClassProfile } from "@/lib/legal/consent";
import { logError } from "@/lib/logging/logger";
import {
  loadBookingWithRelations,
  notifyCancelledByClient,
  notifyRescheduleRequested,
} from "@/lib/notifications/booking-notifications";
import { prisma } from "@/lib/prisma";
import { canLeaveReview, reviewWindowFor } from "@/lib/reviews/can-leave";
import { createReview } from "@/lib/reviews/service";
import type { ReviewDto } from "@/lib/reviews/types";

/**
 * GUEST-MANAGE-LINK (2026-09-24, решение владельца) — управление записью по
 * ссылке без аккаунта: посмотреть, отменить, попросить перенос.
 *
 * Право даёт подписанный токен (`guest-manage-token.ts`) и только пока клиент
 * записи — гостевой профиль (`isGuestClassProfile`, RKN-FIX-02). Стоило гостю
 * завести аккаунт, запись живёт в кабинете, и ссылка отвечает «войдите» —
 * предъявительская ссылка не должна управлять записью аккаунта.
 *
 * Отмена и перенос идут теми же путями, что у клиента в кабинете
 * (`cancelBooking` / `cancelSoloPackageBooking` / `rescheduleBooking` со
 * стороной `CLIENT`), — дедлайн отмены, окно записи, лимит переносов и
 * согласование переноса мастером действуют без исключений. Пакет отменяется
 * целиком (инв. #34), переносится по услугам.
 */

export type GuestManageScope = {
  bookingId: string;
  clientUserId: string;
  bookingPackageId: string | null;
  /** Записи, которыми можно управлять: сама запись и услуги её пакета. */
  bookingIds: string[];
};

const INVALID_LINK = () =>
  new AppError("Ссылка недействительна или устарела.", 404, "GUEST_MANAGE_LINK_INVALID");

export async function resolveGuestManageScope(token: string): Promise<GuestManageScope> {
  const bookingId = verifyGuestManageToken(token);
  if (!bookingId) throw INVALID_LINK();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientUserId: true,
      bookingPackageId: true,
      // include-ok: услуги одного пакета — их единицы, пакет не растёт после создания.
      bookingPackage: { select: { bookings: { select: { id: true }, orderBy: { startAtUtc: "asc" } } } },
    },
  });
  if (!booking?.clientUserId) throw INVALID_LINK();
  if (!(await isGuestClassProfile(booking.clientUserId))) {
    throw new AppError(
      "Эта запись привязана к аккаунту. Войдите, чтобы управлять ею.",
      403,
      "GUEST_MANAGE_ACCOUNT_REQUIRED",
    );
  }
  return {
    bookingId: booking.id,
    clientUserId: booking.clientUserId,
    bookingPackageId: booking.bookingPackageId,
    bookingIds: booking.bookingPackage?.bookings.map((item) => item.id) ?? [booking.id],
  };
}

/**
 * Токен для ответа на создание гостевой записи. `null` — клиент записи не
 * гость (телефон принадлежит аккаунту, RKN-FIX-02): управлять ею — из кабинета.
 */
export async function issueGuestManagePath(bookingId: string, clientUserId: string): Promise<string | null> {
  if (!(await isGuestClassProfile(clientUserId))) return null;
  return guestManagePath(signGuestManageToken(bookingId));
}

export type GuestManageItem = {
  bookingId: string;
  serviceTitle: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  status: BookingRuntimeStatus;
  proposedStartAt: string | null;
  canReschedule: boolean;
  /** Кто выполняет — для выдачи окошек переноса (`/slots` исполнителя). */
  performerProviderId: string;
  serviceId: string;
  /**
   * 29.09 доработки · 05 — отзыв по ссылке. `canLeave` — то же правило, что у
   * кабинета (`canLeaveReview`: окно после визита, автор — клиент записи);
   * `left` — отзыв уже оставлен (в том числе удалённый — повторно нельзя);
   * `deadlineUtc` — до какого момента можно оставить.
   */
  review: { canLeave: boolean; left: boolean; deadlineUtc: string | null };
};

export type GuestManageView = {
  providerName: string;
  providerPublicUsername: string | null;
  providerType: "MASTER" | "STUDIO";
  providerAddress: string | null;
  masterName: string | null;
  timezone: string;
  /** `null` — поздней отмены у провайдера нет. */
  cancellationDeadlineHours: number | null;
  isPackage: boolean;
  canCancel: boolean;
  items: GuestManageItem[];
};

export async function getGuestManageView(scope: GuestManageScope, now: Date = new Date()): Promise<GuestManageView> {
  const rows = await prisma.booking.findMany({
    where: { id: { in: scope.bookingIds } },
    orderBy: { startAtUtc: "asc" },
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      proposedStartAt: true,
      providerId: true,
      masterProviderId: true,
      serviceId: true,
      clientUserId: true,
      service: { select: { name: true, title: true, durationMin: true } },
      serviceItems: { select: { titleSnapshot: true }, take: 1 },
      review: { select: { id: true } },
      provider: {
        select: {
          name: true,
          publicUsername: true,
          type: true,
          address: true,
          timezone: true,
          cancellationDeadlineHours: true,
        },
      },
      masterProvider: { select: { name: true, timezone: true } },
    },
  });
  const first = rows[0];
  if (!first) throw INVALID_LINK();

  const items: GuestManageItem[] = rows.map((row) => {
    const status = resolveBookingRuntimeStatus({
      status: row.status,
      startAtUtc: row.startAtUtc,
      endAtUtc: row.endAtUtc,
      now,
    });
    const window = reviewWindowFor(row);
    const left = row.review != null;
    return {
      bookingId: row.id,
      serviceTitle: row.serviceItems[0]?.titleSnapshot ?? row.service.title ?? row.service.name,
      startAtUtc: row.startAtUtc?.toISOString() ?? null,
      endAtUtc: row.endAtUtc?.toISOString() ?? null,
      status,
      proposedStartAt: row.proposedStartAt?.toISOString() ?? null,
      canReschedule: status === "PENDING" || status === "CONFIRMED",
      performerProviderId: row.masterProviderId ?? row.providerId,
      serviceId: row.serviceId,
      review: {
        canLeave: !left && canLeaveReview({ booking: row, currentUserId: scope.clientUserId, nowUtc: now }),
        left,
        deadlineUtc: window?.deadline.toISOString() ?? null,
      },
    };
  });

  const live = items.filter((item) => item.status !== "REJECTED" && item.status !== "FINISHED");
  const started = items.some((item) => item.status === "IN_PROGRESS" || item.status === "FINISHED");
  const canCancel =
    live.length > 0 &&
    !(scope.bookingPackageId && started) &&
    live.every((item) => canCancelBookingStatus(rows.find((row) => row.id === item.bookingId)!.status)) &&
    live.every((item) => item.status !== "IN_PROGRESS");

  return {
    providerName: first.provider.name,
    providerPublicUsername: first.provider.publicUsername,
    providerType: first.provider.type === "STUDIO" ? "STUDIO" : "MASTER",
    providerAddress: first.provider.address?.trim() || null,
    masterName: first.masterProvider?.name ?? null,
    timezone: first.masterProvider?.timezone ?? first.provider.timezone,
    cancellationDeadlineHours: first.provider.cancellationDeadlineHours,
    isPackage: scope.bookingPackageId !== null,
    canCancel,
    items,
  };
}

export async function cancelGuestBooking(scope: GuestManageScope): Promise<{ cancelledBookingIds: string[] }> {
  let cancelledBookingIds: string[];
  if (scope.bookingPackageId) {
    const result = await cancelSoloPackageBooking({
      bookingPackageId: scope.bookingPackageId,
      cancelledBy: "CLIENT",
      reason: null,
    });
    cancelledBookingIds = result.cancelledBookingIds;
  } else {
    await cancelBooking({ bookingId: scope.bookingId, cancelledBy: "CLIENT", reason: null });
    cancelledBookingIds = [scope.bookingId];
  }

  // Как в кабинете: одно уведомление стороне провайдера (у пакета — по первой
  // услуге) и задача «освободилось окошко» по каждой отменённой записи.
  try {
    const firstId = cancelledBookingIds[0];
    const full = firstId ? await loadBookingWithRelations(firstId) : null;
    if (full) await notifyCancelledByClient(full);
    for (const bookingId of cancelledBookingIds) {
      const component = bookingId === full?.id ? full : await loadBookingWithRelations(bookingId);
      if (component) void enqueueSlotFreedJob(component, scope.clientUserId);
    }
  } catch (error) {
    logError("guest manage · cancel side effects failed", {
      bookingId: scope.bookingId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { cancelledBookingIds };
}

export async function rescheduleGuestBooking(
  scope: GuestManageScope,
  input: { bookingId: string; startAtUtc: Date; endAtUtc: Date; slotLabel: string },
): Promise<{ id: string; status: string }> {
  if (!scope.bookingIds.includes(input.bookingId)) throw INVALID_LINK();

  const result = await rescheduleBooking({
    bookingId: input.bookingId,
    actorUserId: scope.clientUserId,
    actor: "CLIENT",
    startAtUtc: input.startAtUtc,
    endAtUtc: input.endAtUtc,
    slotLabel: input.slotLabel,
  });
  if (!result.ok) throw new AppError(result.message, result.status, resolveErrorCode(result.code, "CONFLICT"));

  try {
    const full = await loadBookingWithRelations(result.data.id);
    if (full) await notifyRescheduleRequested(full);
  } catch (error) {
    logError("guest manage · reschedule notification failed", {
      bookingId: input.bookingId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { id: result.data.id, status: result.data.status };
}

/**
 * 29.09 доработки · 05 — отзыв гостя по ссылке. Проверки — те же, что у
 * клиента в кабинете (`createReview`: окно, автор = клиент записи, самоотзыв,
 * один отзыв на запись); здесь только право ссылки: запись — эта или услуга
 * её пакета. Правки и удаления по ссылке нет (решение владельца 2026-09-29:
 * предъявительская ссылка не переписывает опубликованное).
 */
export async function createGuestReview(
  scope: GuestManageScope,
  input: {
    bookingId: string;
    rating: number;
    text?: string;
    publicTagIds: string[];
    privateTagIds: string[];
  },
): Promise<ReviewDto> {
  if (!scope.bookingIds.includes(input.bookingId)) throw INVALID_LINK();
  return createReview({
    currentUserId: scope.clientUserId,
    bookingId: input.bookingId,
    rating: input.rating,
    text: input.text,
    publicTagIds: input.publicTagIds,
    privateTagIds: input.privateTagIds,
  });
}

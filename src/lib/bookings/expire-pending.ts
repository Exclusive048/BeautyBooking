import { BookingCancelledBy, BookingPackageStatus, BookingStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { PENDING_EXPIRY_HOURS } from "@/lib/bookings/flow";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { applyBookingTransition } from "@/lib/bookings/transition";
import { logError } from "@/lib/logging/logger";
import {
  loadBookingWithRelations,
  notifyPendingBookingExpired,
} from "@/lib/notifications/booking-notifications";

/**
 * PENDING-EXPIRY (решение владельца 2026-09-24) — неподтверждённая запись
 * (`NEW`/`PENDING`) отменяется автоматически, если мастер (или студия) не
 * подтвердил её за `PENDING_EXPIRY_HOURS` часов после создания либо к началу
 * визита — что наступит раньше.
 *
 * Раньше такая запись висела «в ожидании» бессрочно: окошко оставалось занятым
 * для других клиентов, а клиент не знал, приходить ли, — вплоть до времени
 * визита и после него (финализатор неподтверждённые визитом не объявляет,
 * BOOKING-FINALIZE-01).
 *
 * Отмена — `REJECTED` с `cancelledBy = SYSTEM` и причиной, единственным
 * примитивом переходов (`applyBookingTransition`, LOGIC-02): если мастер успел
 * подтвердить между чтением и записью, побеждает он, строка пропускается.
 * Пакет отменяется только ЦЕЛИКОМ (инв. #34) и только когда неподтверждены все
 * его живые компоненты — подтверждённую мастером часть задача не трогает.
 *
 * Уведомления (клиенту и стороне провайдера) уходят, только если визит ещё не
 * закончился: первый проход на накопленной истории не должен рассылать
 * «запись отменена» по визитам месячной давности — там это просто уборка.
 */
const EXPIRABLE_STATUSES: BookingStatus[] = [BookingStatus.NEW, BookingStatus.PENDING];
const BATCH_SIZE = 200;
export const PENDING_EXPIRY_REASON = "Запись не подтвердили вовремя.";

export function pendingExpiryWhere(now: Date): Prisma.BookingWhereInput {
  const createdBefore = new Date(now.getTime() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);
  return {
    status: { in: EXPIRABLE_STATUSES },
    OR: [{ createdAt: { lte: createdBefore } }, { startAtUtc: { lte: now } }],
  };
}

function expiryData(now: Date) {
  return {
    status: BookingStatus.REJECTED,
    cancelledBy: BookingCancelledBy.SYSTEM,
    cancelReason: PENDING_EXPIRY_REASON,
    cancelledAtUtc: now,
    actionRequiredBy: null,
    proposedStartAt: null,
    proposedEndAt: null,
  };
}

type ExpiredRow = {
  id: string;
  providerId: string;
  masterProviderId: string | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
};

async function afterExpiry(rows: ExpiredRow[], notifyRow: ExpiredRow, now: Date): Promise<void> {
  for (const row of rows) {
    try {
      await invalidateSlotsForBookingRange({
        providerId: row.providerId,
        masterProviderId: row.masterProviderId,
        startAtUtc: row.startAtUtc,
        endAtUtc: row.endAtUtc,
      });
    } catch (error) {
      logError("bookings.pendingExpiry.slotInvalidation.failed", {
        bookingId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!notifyRow.endAtUtc || notifyRow.endAtUtc.getTime() <= now.getTime()) return;
  try {
    const booking = await loadBookingWithRelations(notifyRow.id);
    if (booking) await notifyPendingBookingExpired(booking);
  } catch (error) {
    logError("bookings.pendingExpiry.notify.failed", {
      bookingId: notifyRow.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function isStatusRace(error: unknown): boolean {
  return error instanceof AppError && error.code === "BOOKING_STATUS_CHANGED";
}

async function expirePackage(bookingPackageId: string, now: Date): Promise<number> {
  const pkg = await prisma.bookingPackage.findUnique({
    where: { id: bookingPackageId },
    select: {
      id: true,
      status: true,
      // include-ok: услуги одного пакета — их единицы, пакет не растёт после создания.
      bookings: {
        select: {
          id: true,
          status: true,
          providerId: true,
          masterProviderId: true,
          startAtUtc: true,
          endAtUtc: true,
        },
        orderBy: { startAtUtc: "asc" },
      },
    },
  });
  if (!pkg || pkg.status === BookingPackageStatus.CANCELLED) return 0;

  const live = pkg.bookings.filter(
    (booking) => booking.status !== BookingStatus.REJECTED && booking.status !== BookingStatus.FINISHED,
  );
  // Мастер подтвердил хоть одну часть — пакет ждёт его решения по остальным.
  if (live.length === 0 || live.some((booking) => !EXPIRABLE_STATUSES.includes(booking.status))) return 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const booking of live) {
        await applyBookingTransition(tx, {
          id: booking.id,
          expectedStatus: booking.status,
          data: expiryData(now),
          select: { id: true },
        });
      }
      await tx.bookingPackage.update({
        where: { id: pkg.id },
        data: { status: BookingPackageStatus.CANCELLED },
      });
    });
  } catch (error) {
    if (isStatusRace(error)) return 0;
    throw error;
  }
  // Одно уведомление на пакет — по первой услуге (как и создание пакета).
  const notifyRow = live.find((booking) => booking.endAtUtc && booking.endAtUtc > now) ?? live[0]!;
  await afterExpiry(live, notifyRow, now);
  return live.length;
}

export async function expirePendingBookings(
  now: Date = new Date(),
): Promise<{ candidates: number; expired: number }> {
  const candidates = await prisma.booking.findMany({
    where: pendingExpiryWhere(now),
    select: {
      id: true,
      status: true,
      bookingPackageId: true,
      providerId: true,
      masterProviderId: true,
      startAtUtc: true,
      endAtUtc: true,
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  let expired = 0;
  const seenPackages = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.bookingPackageId) {
      if (seenPackages.has(candidate.bookingPackageId)) continue;
      seenPackages.add(candidate.bookingPackageId);
      expired += await expirePackage(candidate.bookingPackageId, now);
      continue;
    }
    try {
      await applyBookingTransition(prisma, {
        id: candidate.id,
        expectedStatus: candidate.status,
        data: expiryData(now),
        select: { id: true },
      });
    } catch (error) {
      if (isStatusRace(error)) continue;
      throw error;
    }
    expired += 1;
    await afterExpiry([candidate], candidate, now);
  }
  return { candidates: candidates.length, expired };
}

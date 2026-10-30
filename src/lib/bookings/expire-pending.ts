import { BookingCancelledBy, BookingPackageStatus, BookingStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { PENDING_EXPIRY_HOURS } from "@/lib/bookings/flow";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { applyBookingTransition } from "@/lib/bookings/transition";
import { logError, logInfo } from "@/lib/logging/logger";
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
 * Решение владельца 2026-10-30 (PENDING-EXPIRY-STARVATION): «неподтверждённые
 * записи должны истекать» — значит и те, что раньше застревали мимо правила:
 * - запрос переноса на НЕПОДТВЕРЖДЁННОЙ записи (`CHANGE_REQUESTED` со
 *   `statusBeforeChange` = `NEW`/`PENDING`) истекает по тем же срокам — от
 *   создания и от ИСХОДНОГО начала визита (`startAtUtc`; предложенное время в
 *   `proposedStartAt` срок не двигает). Перенос ПОДТВЕРЖДЁННОЙ записи
 *   (`statusBeforeChange` = `CONFIRMED`, либо пусто у строк до миграции) не
 *   истекает: визит в силе, ответа ждёт только новое время;
 * - сосед по пакету в терминальном статусе — неявка, как отмена и состоявшийся
 *   визит, — истечению остальных не мешает: «живые» — только нетерминальные.
 *
 * Уведомления (клиенту и стороне провайдера) уходят, только если визит ещё не
 * закончился: первый проход на накопленной истории не должен рассылать
 * «запись отменена» по визитам месячной давности — там это просто уборка.
 */
const UNCONFIRMED_STATUSES: BookingStatus[] = [BookingStatus.NEW, BookingStatus.PENDING];
/**
 * Терминальные статусы услуги: её судьба решена, и истечению соседей по пакету
 * она не мешает. `CANCELLED` и `NO_SHOW` — те «отменена/неявка», которые
 * `flow.ts` сводит к `REJECTED`; `FINISHED` — визит состоялся.
 */
const TERMINAL_STATUSES: BookingStatus[] = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
  BookingStatus.FINISHED,
];
export const PENDING_EXPIRY_BATCH_SIZE = 200;
export const PENDING_EXPIRY_REASON = "Запись не подтвердили вовремя.";

/**
 * Запись ждёт ПЕРВОГО подтверждения: `NEW`/`PENDING` либо запрос переноса,
 * открытый, пока она была неподтверждённой. Единственное правило
 * «неподтверждена» — для выборки кандидатов и для пакета; копии в памяти нет.
 */
export function unconfirmedBookingWhere(): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: UNCONFIRMED_STATUSES } },
      { status: BookingStatus.CHANGE_REQUESTED, statusBeforeChange: { in: UNCONFIRMED_STATUSES } },
    ],
  };
}

/**
 * Услуга, из-за которой пакет истечь НЕ может: живая (нетерминальная) и при этом
 * не «неподтверждена» — подтверждена, идёт, предоплачена или в переносе
 * подтверждённой записи. Записано ПОЛОЖИТЕЛЬНО, а не как `NOT unconfirmed`:
 * `statusBeforeChange` бывает пустым, а `NOT (… IN …)` над `NULL` в SQL даёт
 * `NULL`, то есть «не блокирует», — и пакет с переносом подтверждённой услуги
 * истёк бы целиком. По той же причине у `notIn` отдельная ветка `null`.
 */
function packageBlockingBookingWhere(): Prisma.BookingWhereInput {
  return {
    OR: [
      {
        status: {
          notIn: [...TERMINAL_STATUSES, ...UNCONFIRMED_STATUSES, BookingStatus.CHANGE_REQUESTED],
        },
      },
      {
        status: BookingStatus.CHANGE_REQUESTED,
        OR: [{ statusBeforeChange: null }, { statusBeforeChange: { notIn: UNCONFIRMED_STATUSES } }],
      },
    ],
  };
}

/**
 * PENDING-EXPIRY-STARVATION (B-02/E-03) — пакет, который можно истечь: не
 * отменён, и ни одна его услуга не блокирует (см. выше). Одно условие на две
 * точки — выборку кандидатов и `expirePackage`, который перечитывает пакет ЭТИМ
 * ЖЕ условием, а не своей проверкой в памяти.
 *
 * Зачем в выборке: она идёт от старых к новым с потолком в пачку. Строка,
 * которую выборка берёт, а `expirePackage` не истечёт, остаётся кандидатом
 * навсегда; когда таких становилось больше пачки, истечение останавливалось для
 * всей платформы без ошибки и лога. Две копии правила разошлись бы ровно так.
 */
export function expirablePackageWhere(): Prisma.BookingPackageWhereInput {
  return {
    status: { not: BookingPackageStatus.CANCELLED },
    bookings: { none: packageBlockingBookingWhere() },
  };
}

export function pendingExpiryWhere(now: Date): Prisma.BookingWhereInput {
  const createdBefore = new Date(now.getTime() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);
  return {
    AND: [
      unconfirmedBookingWhere(),
      // `startAtUtc` — исходное время визита и у записи с запросом переноса.
      { OR: [{ createdAt: { lte: createdBefore } }, { startAtUtc: { lte: now } }] },
      { OR: [{ bookingPackageId: null }, { bookingPackage: { is: expirablePackageWhere() } }] },
    ],
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
    // Запрос переноса закрыт вместе с записью — как при отказе от переноса.
    statusBeforeChange: null,
  };
}

const EXPIRY_CANDIDATE_SELECT = {
  id: true,
  status: true,
  statusBeforeChange: true,
  providerId: true,
  masterProviderId: true,
  startAtUtc: true,
  endAtUtc: true,
} as const satisfies Prisma.BookingSelect;

type ExpiryCandidate = Prisma.BookingGetPayload<{ select: typeof EXPIRY_CANDIDATE_SELECT }>;

/**
 * Охрана перехода — наблюдённый статус и, у запроса переноса, наблюдённое
 * `statusBeforeChange`: между чтением и записью мастер мог подтвердить перенос
 * (`CONFIRMED`), а клиент — тут же попросить новый (снова `CHANGE_REQUESTED`,
 * но уже от подтверждённой записи). Один статус такую смену не видит.
 */
function expiryTransition(booking: ExpiryCandidate, now: Date) {
  return {
    id: booking.id,
    expectedStatus: booking.status,
    ...(booking.status === BookingStatus.CHANGE_REQUESTED
      ? { expectAlso: { statusBeforeChange: booking.statusBeforeChange } }
      : {}),
    data: expiryData(now),
    select: { id: true },
  };
}

async function afterExpiry(rows: ExpiryCandidate[], notifyRow: ExpiryCandidate, now: Date): Promise<void> {
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
  // Пакет перечитывается ТЕМ ЖЕ условием, что в выборке, — проверка «можно ли
  // истечь» одна; в памяти остаётся только «какие услуги живые».
  const pkg = await prisma.bookingPackage.findFirst({
    where: { id: bookingPackageId, ...expirablePackageWhere() },
    select: {
      id: true,
      // include-ok: услуги одного пакета — их единицы, пакет не растёт после создания.
      bookings: { select: EXPIRY_CANDIDATE_SELECT, orderBy: { startAtUtc: "asc" } },
    },
  });
  if (!pkg) return 0;

  // Раз пакет прошёл условие, каждая живая услуга в нём — неподтверждённая.
  const live = pkg.bookings.filter((booking) => !TERMINAL_STATUSES.includes(booking.status));
  if (live.length === 0) return 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const booking of live) {
        await applyBookingTransition(tx, expiryTransition(booking, now));
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
  // Одно уведомление на пакет — по первой предстоящей услуге (как и создание пакета).
  const notifyRow = live.find((booking) => booking.endAtUtc && booking.endAtUtc > now) ?? live[0]!;
  await afterExpiry(live, notifyRow, now);
  return live.length;
}

export async function expirePendingBookings(
  now: Date = new Date(),
): Promise<{ candidates: number; expired: number }> {
  const candidates = await prisma.booking.findMany({
    where: pendingExpiryWhere(now),
    select: { ...EXPIRY_CANDIDATE_SELECT, bookingPackageId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: PENDING_EXPIRY_BATCH_SIZE,
  });

  let expired = 0;
  /** Строки пачки, которые остались неподтверждёнными (гонка или новый класс застревания). */
  let stuck = 0;
  const packageOutcome = new Map<string, boolean>();
  for (const candidate of candidates) {
    if (candidate.bookingPackageId) {
      const known = packageOutcome.get(candidate.bookingPackageId);
      if (known !== undefined) {
        if (!known) stuck += 1;
        continue;
      }
      const count = await expirePackage(candidate.bookingPackageId, now);
      packageOutcome.set(candidate.bookingPackageId, count > 0);
      expired += count;
      if (count === 0) stuck += 1;
      continue;
    }
    try {
      await applyBookingTransition(prisma, expiryTransition(candidate, now));
    } catch (error) {
      if (isStatusRace(error)) {
        stuck += 1;
        continue;
      }
      throw error;
    }
    expired += 1;
    await afterExpiry([candidate], candidate, now);
  }

  // Полная пачка, в которой что-то не сдвинулось, — признак того, что голову
  // выборки занимают строки, которые истечь не могут (так и копилось
  // застревание B-02 — молча, ответом `{ candidates: 200, expired: 0 }`).
  // Отдельные гонки с подтверждением мастера — штатны, это строка в лог; вся
  // пачка без движения — остановка механизма, это ошибка с алертом.
  if (candidates.length === PENDING_EXPIRY_BATCH_SIZE && stuck > 0) {
    const meta = { candidates: candidates.length, expired, stuck };
    if (stuck === candidates.length) logError("bookings.pendingExpiry.batchStalled", meta);
    else logInfo("bookings.pendingExpiry.batchShort", meta);
  }
  return { candidates: candidates.length, expired };
}

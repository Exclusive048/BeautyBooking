import { BookingStatus, NotificationType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadBookingsWithRelations, notifyBookingCompletedReview } from "@/lib/notifications/booking-notifications";
import { logError, logInfo } from "@/lib/logging/logger";
import { REVIEW_GRACE_MINUTES } from "@/lib/reviews/constants";

/**
 * REVIEW-PROMPT-01 — кому и когда уходит «Оставьте отзыв».
 *
 * 🔴 Три дефекта прежней формы, каждый из которых сам по себе лишал визит
 * запроса отзыва:
 *   1. Запрос уходил сразу после `endAtUtc`, а отзыв открывается только через
 *      `REVIEW_GRACE_MINUTES` после конца (`reviews/can-leave.ts`). Клиент,
 *      нажавший сразу, попадал на запись без кнопки «Оставить отзыв», а
 *      повторного запроса не бывает.
 *   2. Брались только `CONFIRMED`. Все студийные записи, онлайн-записи мастеров
 *      без автоподтверждения и ручные записи рождаются `PENDING`, и после начала
 *      визита подтвердить их уже нельзя — такой визит запроса не получал
 *      никогда, хотя оставить отзыв сервер ему разрешает. Теперь отбор тот же,
 *      что у права на отзыв: любой статус, кроме закрытых.
 *   3. Пакет из N услуг давал N запросов подряд. Теперь запрос один — по
 *      последней по времени услуге пакета.
 *
 * REVIEW-PROMPT-SELECTION (B-03, 2026-10-30) — выборка «первые 200 из окна»
 * была без порядка и без исключения уже приглашённых: те оставались в окне
 * (24 ч) и занимали места, как и непоследние услуги пакетов, которые запроса не
 * получают вовсе. При большом объёме новый визит в 200 не попадал — запрос
 * опаздывал, а после выхода из окна терялся. Теперь уже приглашённые
 * исключаются В ЗАПРОСЕ (связь `Booking.notifications`), порядок — по
 * `endAtUtc`, `id`, и проход листает окно ключом (`endAtUtc`, `id`) до
 * `REVIEW_PROMPT_MAX_PAGES` страниц за тик.
 */
const PROMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = REVIEW_GRACE_MINUTES * 60 * 1000;
export const REVIEW_PROMPT_PAGE_SIZE = 200;
/**
 * Потолок страниц за один тик (раз в 30 минут) — граница работы прохода, а не
 * объёма: не дочитанное окно дочитает следующий тик, у визита на это 24 ч.
 */
export const REVIEW_PROMPT_MAX_PAGES = 10;

/** Закрытые статусы — отзыв по ним не оставить (`reviewWindowFor`). */
const NON_REVIEWABLE_STATUSES: BookingStatus[] = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

type PromptCandidate = { id: string; bookingPackageId: string | null; endAtUtc: Date | null };
type PageCursor = { endAtUtc: Date; id: string };

export function reviewPromptWhere(now: Date): Prisma.BookingWhereInput {
  // Окно отзыва открывается в `endAtUtc + grace` — запрос уходит не раньше.
  const readyBefore = new Date(now.getTime() - GRACE_MS);
  const windowStart = new Date(readyBefore.getTime() - PROMPT_WINDOW_MS);
  return {
    status: { notIn: NON_REVIEWABLE_STATUSES },
    endAtUtc: { gte: windowStart, lte: readyBefore },
    clientUserId: { not: null },
    review: { is: null },
    // Уже приглашённые — не кандидаты: иначе они до конца окна занимают места
    // в выборке. Дедуп держится на самом уведомлении (одном на визит).
    notifications: { none: { type: NotificationType.BOOKING_COMPLETED_REVIEW } },
  };
}

function afterCursor(cursor: PageCursor): Prisma.BookingWhereInput {
  return {
    OR: [
      { endAtUtc: { gt: cursor.endAtUtc } },
      { endAtUtc: cursor.endAtUtc, id: { gt: cursor.id } },
    ],
  };
}

export async function runBookingReviewPromptJob(now = new Date()): Promise<void> {
  const where = reviewPromptWhere(now);
  let cursor: PageCursor | null = null;
  let pages = 0;
  let scanned = 0;

  while (pages < REVIEW_PROMPT_MAX_PAGES) {
    const page: PromptCandidate[] = await prisma.booking.findMany({
      where: cursor ? { AND: [where, afterCursor(cursor)] } : where,
      select: { id: true, bookingPackageId: true, endAtUtc: true },
      orderBy: [{ endAtUtc: "asc" }, { id: "asc" }],
      take: REVIEW_PROMPT_PAGE_SIZE,
    });
    pages += 1;
    scanned += page.length;
    if (page.length === 0) return;

    await promptPage(page);

    const last = page[page.length - 1]!;
    if (page.length < REVIEW_PROMPT_PAGE_SIZE || !last.endAtUtc) return;
    cursor = { endAtUtc: last.endAtUtc, id: last.id };
  }

  // Окно не дочитано за тик — остаток возьмёт следующий; строка в лог, чтобы
  // рост объёма был виден до того, как запросы начнут опаздывать на часы.
  logInfo("bookings.reviewPrompts.pageCeiling", { pages, scanned });
}

async function promptPage(page: PromptCandidate[]): Promise<void> {
  const promptable = await dropNonFinalPackageComponents(page);
  if (promptable.length === 0) return;

  // PERF-26: снапшоты грузятся одним запросом на страницу, а не поштучно
  // внутри цикла. Прежняя форма стоила `findUnique` + рассылка на КАЖДОГО
  // кандидата, то есть до 400 последовательных round-trip'ов на 200 строк.
  // Сама рассылка остаётся последовательной и по-прежнему изолирована
  // try/catch на элемент: она шлёт push и пишет уведомление, и падение одного
  // получателя не должно ни останавливать проход, ни ускоряться за счёт
  // параллельной нагрузки на push-канал.
  const pendingIds = promptable.map((item) => item.id);
  const bookings = await loadBookingsWithRelations(pendingIds);

  for (const id of pendingIds) {
    try {
      const booking = bookings.get(id);
      if (!booking) continue;
      await notifyBookingCompletedReview(booking);
    } catch (error) {
      logError("Booking review prompt failed", {
        bookingId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Из компонентов пакета оставляет только ПОСЛЕДНИЙ по времени (среди всех
 * живых компонентов пакета, а не только попавших в выборку): запрос отзыва
 * уходит, когда закончился весь пакет, и ровно один раз.
 */
async function dropNonFinalPackageComponents(
  candidates: PromptCandidate[],
): Promise<PromptCandidate[]> {
  const packageIds = Array.from(
    new Set(candidates.map((c) => c.bookingPackageId).filter((id): id is string => Boolean(id))),
  );
  if (packageIds.length === 0) return candidates;

  const components = await prisma.booking.findMany({
    where: { bookingPackageId: { in: packageIds }, status: { notIn: NON_REVIEWABLE_STATUSES } },
    select: { id: true, bookingPackageId: true, endAtUtc: true },
  });
  const finalByPackage = new Map<string, string>();
  for (const packageId of packageIds) {
    const last = components
      .filter((c) => c.bookingPackageId === packageId)
      .sort(
        (a, b) =>
          (b.endAtUtc?.getTime() ?? 0) - (a.endAtUtc?.getTime() ?? 0) || b.id.localeCompare(a.id),
      )[0];
    if (last) finalByPackage.set(packageId, last.id);
  }

  return candidates.filter(
    (c) => !c.bookingPackageId || finalByPackage.get(c.bookingPackageId) === c.id,
  );
}

import "server-only";

import type { Prisma } from "@prisma/client";
import type { JournalWindow } from "@/features/bookings-journal/lib/journal-params";
import { journalSearchWhere, journalWindowWhere } from "@/features/bookings-journal/server/journal-where";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { bookingStatusGroupFilter, type BookingStatusGroup } from "@/lib/bookings/status-groups";
import { parseClientKeyIdentity } from "@/lib/crm/card-service";
import { buildPhoneVariants } from "@/lib/crm/card-utils";
import { loadMasterBookingItems, type MasterBookingItem } from "@/lib/master/booking-items.service";
import { prisma } from "@/lib/prisma";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * BOOKINGS-JOURNAL — журнал записей кабинета мастера (`/cabinet/master/bookings`).
 *
 * Сервис решает «какие записи и в каком порядке» (окно дат салона, поиск,
 * состояние, история клиента), а элемент записи собирает общий
 * `loadMasterBookingItems` — та же форма, те же действия (`master-actions.ts`),
 * что у приложения. Скоуп — записи, которые мастер ВЫПОЛНЯЕТ, по всем его
 * рабочим профилям (личный + профили в студиях, STUDIO-MASTER-PROFILES).
 *
 * Телефона в элементе нет (RKN-FIX-10): поиск по телефону находит запись, но
 * номер не отдаёт — он в карточке клиента.
 */

export type MasterJournalQuery = {
  /** Все рабочие профили мастера (`getMasterWorkProfiles(...).allIds`). */
  workProfileIds: readonly string[];
  /** Пояс кабинета мастера — границы суток салона (salon-tz). */
  timeZone: string;
  /** Окно дат салона; `null` — без окна (история одного клиента). */
  window: JournalWindow | null;
  search: string;
  status: BookingStatusGroup | "all";
  /** Проверенный ключ клиента (`verifyClientKeyToken`) — только его записи. */
  clientKey?: string | null;
  limit: number;
  /** История клиента — свежие первыми; день и предстоящие — по времени. */
  order: "asc" | "desc";
  now?: Date;
};

export type MasterJournalResult = {
  items: MasterBookingItem[];
  /** За показанными есть ещё записи — «Показать ещё». */
  hasMore: boolean;
};

/** Ключ клиента CRM → условие на записи (аккаунт либо любой формат номера). */
export function clientKeyBookingWhere(clientKey: string): Prisma.BookingWhereInput {
  const { identity } = parseClientKeyIdentity(clientKey);
  if (identity.clientUserId) return { clientUserId: identity.clientUserId };
  const variants = identity.clientPhone ? buildPhoneVariants(identity.clientPhone) : [];
  return {
    OR: [{ clientPhone: { in: variants } }, { clientPhoneSnapshot: { in: variants } }],
  };
}

export function buildMasterJournalWhere(query: MasterJournalQuery): Prisma.BookingWhereInput {
  const statuses = bookingStatusGroupFilter(query.status);
  const search = journalSearchWhere(query.search, { includeMaster: false });
  const conditions: Prisma.BookingWhereInput[] = [masterPerformedBookingWhere(query.workProfileIds)];
  if (query.window) conditions.push(journalWindowWhere(query.window, query.timeZone));
  if (statuses !== "all") conditions.push({ status: { in: [...statuses] } });
  if (search) conditions.push(search);
  if (query.clientKey) conditions.push(clientKeyBookingWhere(query.clientKey));
  return { AND: conditions };
}

export async function loadMasterBookingsJournal(query: MasterJournalQuery): Promise<MasterJournalResult> {
  const direction = query.order;
  const rows = await prisma.booking.findMany({
    where: buildMasterJournalWhere(query),
    orderBy: [{ startAtUtc: direction }, { id: direction }],
    take: query.limit + 1,
    select: { id: true },
  });
  const hasMore = rows.length > query.limit;
  const ids = rows.slice(0, query.limit).map((row) => row.id);
  const items = await loadMasterBookingItems({
    ids,
    workProfileIds: query.workProfileIds,
    now: query.now,
  });
  return { items, hasMore };
}

/**
 * `?focus=<id>` из уведомления или карточки клиента: день салона, на который
 * стоит запись, — чтобы журнал открылся там, где её подсветят. Чужая или
 * удалённая запись — `null` (журнал откроется на сегодня).
 */
export async function resolveMasterFocusDateKey(input: {
  bookingId: string;
  workProfileIds: readonly string[];
  timeZone: string;
}): Promise<string | null> {
  const booking = await prisma.booking.findFirst({
    where: { AND: [{ id: input.bookingId }, masterPerformedBookingWhere(input.workProfileIds)] },
    select: { startAtUtc: true },
  });
  return booking?.startAtUtc ? toLocalDateKey(booking.startAtUtc, input.timeZone) : null;
}

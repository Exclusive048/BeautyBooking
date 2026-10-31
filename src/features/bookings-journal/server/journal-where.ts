import type { Prisma } from "@prisma/client";
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import type { JournalWindow } from "../lib/journal-params";
import { tokenizeJournalSearch, type JournalSearchToken } from "../lib/search-tokens";

/**
 * BOOKINGS-JOURNAL — условия Prisma журнала записей: окно дат салона и поиск.
 * Скоуп («чьи записи») и статус добавляет вызывающий — у мастера и студии они
 * разные, а окно и поиск одни.
 */

/**
 * Окно дат салона → `startAtUtc`. Границы — полночь салона (salon-tz,
 * `localDayRangeUtc`), а не UTC-сутки: у екатеринбургской студии день
 * начинается в 19:00 UTC предыдущего дня.
 */
export function journalWindowWhere(window: JournalWindow, timeZone: string): Prisma.BookingWhereInput {
  const fromUtc = localDayRangeUtc(window.fromKey, timeZone).startUtc;
  if (!window.toKeyExclusive) return { startAtUtc: { gte: fromUtc } };
  const toUtc = localDayRangeUtc(window.toKeyExclusive, timeZone).startUtc;
  return { startAtUtc: { gte: fromUtc, lt: toUtc } };
}

function contains(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}

function tokenWhere(token: JournalSearchToken, options: { includeMaster: boolean }): Prisma.BookingWhereInput {
  if (token.kind === "digits") {
    return {
      OR: token.variants.flatMap((digits) => [
        { clientPhone: { contains: digits } },
        { clientPhoneSnapshot: { contains: digits } },
        { clientUser: { phone: { contains: digits } } },
      ]),
    };
  }
  const value = token.value;
  return {
    OR: [
      { clientName: contains(value) },
      {
        clientUser: {
          OR: [{ firstName: contains(value) }, { lastName: contains(value) }, { displayName: contains(value) }],
        },
      },
      { service: { OR: [{ name: contains(value) }, { title: contains(value) }] } },
      { serviceItems: { some: { titleSnapshot: contains(value) } } },
      ...(options.includeMaster ? [{ masterProvider: { name: contains(value) } }] : []),
    ],
  };
}

/**
 * Строка поиска → условие: КАЖДОЕ слово должно найтись хотя бы в одном поле
 * (имя клиента в записи, имя/фамилия/отображаемое имя аккаунта клиента,
 * услуга, телефон, у студии — имя мастера). `null` — искать нечего.
 */
export function journalSearchWhere(
  search: string,
  options: { includeMaster: boolean },
): Prisma.BookingWhereInput | null {
  const tokens = tokenizeJournalSearch(search);
  if (tokens.length === 0) return null;
  return { AND: tokens.map((token) => tokenWhere(token, options)) };
}

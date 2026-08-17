import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * FIX-C6 · STRUCTURAL-IMPOSSIBILITY — транзакция booking-домена как ТИП, а не
 * как соглашение.
 *
 * ## Что здесь заменяется
 *
 * Два правила держались детекторами по форме вызова, и оба обходились одним и
 * тем же приёмом — собрать аргумент до вызова:
 *
 *   - **инв. #31** («повторная проверка конфликта идёт под `Serializable`») —
 *     сторож `serializable-recheck.test.ts` искал `ensureNoConflicts(tx` и
 *     отдельно строку `isolationLevel: … Serializable` где-нибудь в том же
 *     файле. Связи между ними не было вообще: файл мог открыть ДВЕ транзакции,
 *     объявить изоляцию в одной и звать проверку в другой — зелено;
 *   - **инв. #45** («строку `Booking` пишет единственный writer») — сторож
 *     искал `.booking.create(`, а `const b = tx.booking; b.create(…)`
 *     компилируется и детектором не виден.
 *
 * Теперь оба свойства несёт тип: изоляцию выбирает не вызывающий, а эта
 * функция, и она же выдаёт клиент, у которого **нет метода `booking.create`**.
 *
 * ## Почему брендом, а не «просто обёрткой»
 *
 * Обёртка, возвращающая обычный `Prisma.TransactionClient`, не мешает написать
 * рядом `prisma.$transaction(async (tx) => { await ensureNoConflicts(tx, …) })`
 * без изоляции — то есть ровно тот дефект, ради которого сторож и заводился
 * (проба FIX-B11: удаление строки `isolationLevel` из `createBooking.ts`
 * оставляло весь прогон зелёным). Бренд делает это невыразимым: параметры
 * `ensureNoConflicts` / `assertNoTimeBlockConflict` / `createBookingRow`
 * объявлены как `typeof prisma | BookingTx`, а `Prisma.TransactionClient`
 * бренда не имеет и в `PrismaClient` не годится (у него нет `$transaction`).
 * Ни переименование при импорте, ни переименование переменной, ни сборка
 * аргумента заранее типа не меняют — значение таскает бренд за собой.
 *
 * ## Что тип НЕ обещает
 *
 * Путь, который не зовёт НИ ОДНУ из проверок и пишет бронь мимо writer'а
 * непуловым клиентом (`prisma.booking.create` вне транзакции), типом не
 * закрыт — у пулового клиента метод остаётся, иначе `booking-row.ts` не смог
 * бы им воспользоваться. Этот угол сторожит остаток
 * `booking-studio-scope.test.ts` (см. его шапку).
 */

declare const SERIALIZABLE_BOOKING_TX: unique symbol;

/**
 * Клиент без вставки строки `Booking`.
 *
 * ⚠️ Это **надтип** обычного клиента: и `Prisma.TransactionClient`, и
 * `PrismaClient` ему присваиваются (у них есть всё перечисленное и сверх того).
 * Поэтому расширение сигнатуры существующего хелпера до `BookingDbClient`
 * ничего не ломает у прежних вызывающих — оно только отнимает у ТЕЛА хелпера
 * право вставить бронь.
 */
export type BookingDbClient = Omit<Prisma.TransactionClient, "booking"> & {
  booking: Omit<Prisma.TransactionClient["booking"], "create">;
};

/**
 * Транзакционный клиент booking-домена. Получить его можно ТОЛЬКО из
 * `bookingTransaction`, а та всегда открывает транзакцию под `Serializable`.
 */
export type BookingTx = BookingDbClient & {
  readonly [SERIALIZABLE_BOOKING_TX]: true;
};

/**
 * Клиент, умеющий открыть транзакцию. Отдельным типом — потому что путь
 * подтверждения модель-оффера работает через `prismaDirect` (обход пула), и
 * его транзакция обязана подчиняться тому же правилу, что остальные шесть.
 */
type TransactionCapableClient = Pick<typeof prisma, "$transaction">;

/**
 * Единственная точка, где booking-домен открывает транзакцию.
 *
 * Уровень изоляции здесь не параметр: `Serializable` — часть инв. #31, а не
 * настройка вызывающего. Под Read Committed повторная проверка конфликта не
 * даёт ничего сверх внешней (обе параллельные транзакции читают «пусто» и обе
 * коммитятся), то есть выглядит защитой, ею не будучи.
 */
export function bookingTransaction<T>(
  fn: (tx: BookingTx) => Promise<T>,
  options?: { client?: TransactionCapableClient },
): Promise<T> {
  const client = options?.client ?? prisma;
  return client.$transaction((tx) => fn(tx as unknown as BookingTx), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

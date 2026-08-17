import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ options: unknown }>,
  /** Что обёртка передала в колбэк. */
  handed: null as unknown,
}));

const fakeTx = { marker: "tx" };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options: unknown) => {
      state.calls.push({ options });
      state.handed = fakeTx;
      return fn(fakeTx);
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { bookingTransaction, type BookingTx } from "@/lib/bookings/booking-transaction";
import { ensureNoConflicts } from "@/lib/bookings/booking-core";
import { createBookingRow } from "@/lib/bookings/booking-row";
import { assertNoTimeBlockConflict } from "@/lib/schedule/time-blocks";

/**
 * FIX-C6 — сторож обёртки, заменивший `serializable-recheck.test.ts`.
 *
 * ## Что изменилось в предмете проверки
 *
 * Прежний сторож обходил дерево и искал `ensureNoConflicts(tx` + строку
 * `isolationLevel: … Serializable` где-нибудь в том же файле. Он был слаб трижды:
 *
 *   1. связи между найденным вызовом и найденной изоляцией не проверялось вовсе
 *      — файл с ДВУМЯ транзакциями проходил, объявив изоляцию не в той;
 *   2. любая форма мимо регекспа делала файл невидимым: переименование при
 *      импорте, переименование переменной транзакции (`async (trx) => …`),
 *      сборка аргумента заранее (`const client = tx`);
 *   3. пути, где повторная проверка своя, а не `ensureNoConflicts` (перенос в
 *      кабинете студии, подтверждение брони), в семью не попадали НИКОГДА —
 *      то есть инв. #31 на них не проверялся ничем.
 *
 * Теперь правило несёт тип: `ensureNoConflicts` / `assertNoTimeBlockConflict` /
 * `createBookingRow` принимают только `typeof prisma | BookingTx`, а `BookingTx`
 * выдаёт единственная функция, которая изоляцию и ставит. Все три формы обхода
 * из п.2 стали ошибками компиляции (проба ниже), а п.1 и п.3 исчезли как класс.
 *
 * Здесь остаётся то, чего тип выразить не может: **что обёртка действительно
 * открывает транзакцию под `Serializable`**. Это одно утверждение о поведении
 * одной функции вместо обхода дерева.
 *
 * @probe   что сломать: убрать `isolationLevel` из `bookingTransaction`.
 *          наблюдалось: «booking-транзакция открыта НЕ под Serializable:
 *          undefined — под Read Committed повторная проверка конфликта не даёт
 *          ничего сверх внешней» — красный.
 * @probe   что сломать (тип): снять `& { readonly [SERIALIZABLE_BOOKING_TX]:
 *          true }` с `BookingTx`.
 *          наблюдалось: `npm run typecheck` красный — 6 неиспользованных
 *          `@ts-expect-error` в блоке ниже («Unused '@ts-expect-error'
 *          directive»), то есть проба перестала быть пробой и это видно.
 */

describe("FIX-C6 · bookingTransaction ставит Serializable сама", () => {
  it("открывает транзакцию под Serializable, а не под изоляцией по умолчанию", async () => {
    state.calls = [];
    await bookingTransaction(async () => "done");

    const options = state.calls[0]?.options as { isolationLevel?: string } | undefined;
    expect(
      options?.isolationLevel,
      "booking-транзакция открыта НЕ под Serializable: " +
        `${JSON.stringify(options?.isolationLevel)} — под Read Committed повторная ` +
        "проверка конфликта не даёт ничего сверх внешней (обе параллельные транзакции " +
        "читают «пусто» и обе коммитятся), то есть выглядит защитой, ею не будучи (инв. #31)",
    ).toBe("Serializable");
  });

  it("возвращает результат колбэка и передаёт ему клиент транзакции", async () => {
    state.calls = [];
    const result = await bookingTransaction(async (tx) => tx);
    expect(result).toBe(fakeTx);
  });

  it("уважает переданный клиент — путь модель-оффера ходит мимо пула", async () => {
    const direct = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx)),
    } as unknown as typeof prisma;

    await bookingTransaction(async () => null, { client: direct });

    expect(direct.$transaction).toHaveBeenCalledOnce();
    expect(
      (direct.$transaction as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1],
    ).toMatchObject({ isolationLevel: "Serializable" });
  });
});

/* ------------------------------------------------------------------ *
 * Проба: ровно та форма обхода, что побеждала все пять детекторов, —
 * собрать аргумент ДО вызова. Ни одна из строк ниже не компилируется.
 * ------------------------------------------------------------------ */

/**
 * 🔴 Стандарт пробы (инв. #43, уточнение FIX-C5): берётся ПРАВДОПОДОБНАЯ форма
 * дефекта, а не минимальная. Правдоподобная здесь известна поимённо — это
 * `const client = tx; ensureNoConflicts(client, …)`, потому что именно она
 * компилируется, читается нормально и невидима любому регекспу по форме вызова.
 *
 * Функция никогда не вызывается: предмет — сам факт того, что тело не
 * компилируется без директив.
 */
async function _argumentObjectEvasion(): Promise<void> {
  const args = {
    providerId: "p",
    masterProviderId: null,
    startAtUtc: new Date(),
    endAtUtc: new Date(),
    bufferMin: 0,
  };

  // Транзакция, открытая в обход обёртки: изоляция по умолчанию, клиент без бренда.
  await (prisma as unknown as { $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> })
    .$transaction(async (trx) => {
      // Форма 1 — прямой вызов с переименованной переменной транзакции.
      // @ts-expect-error инв. #31: `Prisma.TransactionClient` не несёт бренда
      // `BookingTx`, то есть транзакция открыта не `bookingTransaction` и под
      // Serializable не гарантирована.
      await ensureNoConflicts(trx, args);

      // Форма 2 — АРГУМЕНТ СОБРАН ЗАРАНЕЕ. Ровно та, что побеждала детектор:
      // регексп ищет `ensureNoConflicts(tx`, а здесь ни `tx`, ни узнаваемой формы.
      const client = trx;
      // @ts-expect-error инв. #31: значение таскает свой тип за собой —
      // переименование переменной ничего не меняет.
      await ensureNoConflicts(client, args);

      // Форма 3 — та же подмена для enforcement-примитива блокировок.
      // @ts-expect-error инв. #31: `assertNoTimeBlockConflict` — тоже
      // enforcement, а не чтение.
      await assertNoTimeBlockConflict(client, {
        masterProviderId: "m",
        startAtUtc: new Date(),
        endAtUtc: new Date(),
      });

      // Форма 4 — writer строки брони в транзакции без бренда.
      // @ts-expect-error инв. #45/#31: `createBookingRow` работает только внутри
      // booking-транзакции.
      await createBookingRow(client, {
        data: {
          providerId: "p",
          serviceId: "s",
          slotLabel: "l",
          clientName: "c",
          clientPhone: "+70000000000",
          source: "WEB",
        },
        select: { id: true },
      });
    });
}

/**
 * Вторая половина: внутри ПРАВИЛЬНОЙ транзакции строку брони всё равно нельзя
 * вставить мимо writer'а — у `BookingTx` нет метода `booking.create`.
 *
 * Прежний детектор (`/\.booking\.create\s*\(/`) обходился извлечением делегата
 * в переменную; здесь обе формы одинаково не компилируются.
 */
async function _rawCreateEvasion(tx: BookingTx): Promise<void> {
  const data = {
    providerId: "p",
    serviceId: "s",
    slotLabel: "l",
    clientName: "c",
    clientPhone: "+70000000000",
    source: "WEB" as const,
  };

  // Форма 1 — прямая, ту детектор видел.
  // @ts-expect-error инв. #45: вставку строки `Booking` делает только
  // `createBookingRow` — он выводит `studioId` из поверхности.
  await tx.booking.create({ data, select: { id: true } });

  // Форма 2 — ДЕЛЕГАТ ИЗВЛЕЧЁН ЗАРАНЕЕ. Компилировалась и была детектору невидима.
  const delegate = tx.booking;
  // @ts-expect-error инв. #45: `create` отсутствует в типе делегата, а не
  // «не найден регекспом».
  await delegate.create({ data, select: { id: true } });
}

// Ссылки, чтобы функции не считались мёртвым кодом линтером; вызова нет.
void _argumentObjectEvasion;
void _rawCreateEvasion;

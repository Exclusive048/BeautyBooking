import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { stripComments } from "@/lib/testing/source-scan";

/**
 * LOGIC-02 — все пять переходов статуса брони читали статус СНАРУЖИ, а писали
 * безусловным `update` по одному `id`. Между чтением и записью статус мог
 * поменять кто угодно.
 *
 * Гонки в миллисекунды для этого не нужно: достаточно, чтобы вкладка мастера
 * была отрендерена ДО отмены. Клиент жмёт «Отменить», мастер — «Подтвердить», и
 * отменённая бронь возвращается в `CONFIRMED`, причём `cancelledAtUtc` /
 * `cancelledBy` остаются заполненными — строка становится внутренне
 * противоречивой, и аналитика считает её и отменённой, и подтверждённой.
 *
 * Serializable это НЕ закрывал: транзакция `confirmBooking` читает другие брони
 * и TimeBlock'и, но не строку самой брони, поэтому read-write-зависимости со
 * строкой нет и SSI не находит цикла.
 *
 * @probe   что сломать (поведение): убрать `status: input.expectedStatus` из
 *          `where` в `lib/bookings/transition.ts`.
 *          наблюдалось: «кладёт наблюдённый статус в WHERE, а не только id:
 *          expected { id: 'b1' } to deeply equal { id: 'b1', status: 'PENDING' }»
 *          — красный, и падает первым.
 * @probe   что сломать (полнота): дописать в `lib/bookings/cancelBooking.ts`
 *          `await prisma.booking.update({ where: { id }, data: { status:
 *          "REJECTED" } });`.
 *          наблюдалось: «Файл пишет статус брони напрямую через booking.update
 *          … src/lib/bookings/cancelBooking.ts» — красный.
 */

const update = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { booking: { update } } }));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyBookingTransition } from "@/lib/bookings/transition";

function notFound() {
  return new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: "6.19.3",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyBookingTransition — LOGIC-02", () => {
  it("кладёт наблюдённый статус в WHERE, а не только id", async () => {
    update.mockResolvedValue({ id: "b1", status: "CONFIRMED" });

    await applyBookingTransition(prisma, {
      id: "b1",
      expectedStatus: "PENDING",
      data: { status: "CONFIRMED" },
      select: { id: true, status: true },
    });

    expect(update.mock.calls[0][0].where).toEqual({ id: "b1", status: "PENDING" });
  });

  it("статус изменился между чтением и записью → 409, а не тихая перезапись", async () => {
    update.mockRejectedValue(notFound());

    await expect(
      applyBookingTransition(prisma, {
        id: "b1",
        expectedStatus: "PENDING",
        data: { status: "CONFIRMED" },
        select: { id: true, status: true },
      }),
    ).rejects.toMatchObject({ status: 409, code: "BOOKING_STATUS_CHANGED" });
  });

  it("`expectAlso` попадает в WHERE — для переходов, зависящих от других полей", async () => {
    update.mockResolvedValue({ id: "b1", status: "CONFIRMED" });
    const proposed = new Date("2026-08-10T09:00:00Z");

    await applyBookingTransition(prisma, {
      id: "b1",
      expectedStatus: "CHANGE_REQUESTED",
      expectAlso: { proposedStartAt: proposed, actionRequiredBy: "MASTER" },
      data: { status: "CONFIRMED" },
      select: { id: true, status: true },
    });

    expect(update.mock.calls[0][0].where).toEqual({
      id: "b1",
      status: "CHANGE_REQUESTED",
      proposedStartAt: proposed,
      actionRequiredBy: "MASTER",
    });
  });

  it("прочие ошибки БД не маскируются под конфликт статуса", async () => {
    const boom = new Error("connection lost");
    update.mockRejectedValue(boom);

    await expect(
      applyBookingTransition(prisma, {
        id: "b1",
        expectedStatus: "PENDING",
        data: { status: "CONFIRMED" },
        select: { id: true },
      }),
    ).rejects.toBe(boom);
  });
});

/**
 * Вторая половина: перечислять пять путей руками бессмысленно — шестой появится
 * ровно так же, как появились эти пять. Guard обходит дерево и требует, чтобы
 * любая запись статуса брони шла через общий примитив.
 */
describe("LOGIC-02 · шестой переход не пройдёт молча", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

  /**
   * Подпись перехода: запись поля `status` в `booking.update`.
   *
   * 🔴 **FIX-C6 — рассмотрен на перевод в тип и ОСТАВЛЕН детектором.** Решение
   * измерено, а не заявлено; эскиз прогонялся против компилятора.
   *
   * Что получилось бы. Сузить `data` у делегата так, чтобы `status` не
   * принимался, **технически возможно**:
   *
   *     update<T extends Prisma.BookingUpdateArgs & { data: { status?: never } }>(
   *       args: Prisma.SelectSubset<T, Prisma.BookingUpdateArgs>,
   *     ): Prisma.Prisma__BookingClient<Prisma.BookingGetPayload<T>>
   *
   * Замер: легитимная запись пути переноса (`studio move` — время + мастер)
   * компилируется, `data: { status: … }` отвергается, и **форма обхода тоже**
   * (аргумент, собранный заранее, отвергается вместе с прямым вызовом).
   *
   * Почему всё-таки нет — три причины, и первая решающая:
   *
   *   1. **Это не одна подмена, а мирроринг генерённых дженериков.** Правило
   *      про `status` живёт в `data`, поэтому сузить надо КАЖДЫЙ метод, который
   *      принимает `data`: `update`, `updateMany`, `upsert`. Каждый —
   *      рукописная копия сигнатуры, приколоченная к ВНУТРЕННИМ типам Prisma
   *      (`SelectSubset`, `Prisma__BookingClient`). Проект Prisma пинит
   *      (CLAUDE.md rule 6) и её генерённые внутренности за API не держит:
   *      патч-бамп 6.19.x переименует такой тип — и билд упадёт в месте, не
   *      имеющем отношения к причине. Сравните со стоимостью соседних трёх
   *      конверсий: `Omit<Delegate, "create">` и бренд — это НЕ повторение
   *      сигнатуры, они переживают любой бамп.
   *   2. **Сообщение компилятора не называет ни поля, ни правила.** Замеренное
   *      дословно: «Type 'string' is not assignable to type 'undefined'», а на
   *      форме с собранным аргументом — стена внутренних типов Prisma
   *      (`Without<…> & BookingUncheckedUpdateInput`, ~500 символов). Человек,
   *      который в это упрётся, не узнает, что ему нужен
   *      `applyBookingTransition`.
   *   3. **Детектор всё равно остаётся** — у пулового `prisma` методы никуда не
   *      деваются, иначе сам примитив не смог бы писать. То есть это была бы
   *      конверсия, которая не удаляет сторожа и не демотирует его, а лишь
   *      добавляет хрупкости.
   *
   * ⚠️ **Чего этот детектор НЕ видит** (записано, чтобы «зелено» читалось как
   * «известных форм нет»):
   *
   *   - `const args = {…}; tx.booking.update(args)` — аргумент собран заранее,
   *     ровно та форма, что победила все пять сторожей кампании;
   *   - **`updateMany`** — шаблон требует `update(` вплотную к `{`, поэтому
   *     `booking.updateMany({ …, data: { status } })` невидим. 🔴 Расширить
   *     шаблон до `update(?:Many)?` НЕЛЬЗЯ дёшево: замерено — он начинает
   *     краснеть на `reminders.ts`, где `status:` попадает в 400-символьное
   *     окно из соседнего запроса. Окно — эвристика близости, а не структурный
   *     признак, и файловое изъятие под неё запрещено правилом 3
   *     GUARD-INTEGRITY. Дыра названа и вынесена в отчёт;
   *   - извлечение делегата в переменную (`const b = tx.booking`).
   */
  const STATUS_WRITE = /booking\.update\(\{[\s\S]{0,400}?status:/;

  const WAIVED: Record<string, string> = {
    "src/lib/bookings/transition.ts": "сам примитив",
  };

  function walk(relDir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(resolve(PROJECT_ROOT, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        out.push(...walk(rel));
        continue;
      }
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      if (/\.tsx?$/.test(entry.name)) out.push(rel);
    }
    return out;
  }

  // FIX-C6 (GUARD-INTEGRITY правило 6): разбор — через общий посимвольный
  // сканер. Свой `.replace(/\/\//…)` в сторожах не писать, а работать по сырому
  // тексту тоже нельзя: `status:` в комментарии внутри 400-символьного окна
  // даёт ложный красный.
  const writers = walk("src").filter((rel) =>
    STATUS_WRITE.test(stripComments(readFileSync(resolve(PROJECT_ROOT, rel), "utf8"))),
  );

  it("каждая запись статуса идёт через applyBookingTransition", () => {
    const unguarded = writers.filter((rel) => rel in WAIVED === false);
    expect(
      unguarded,
      `Файл пишет статус брони напрямую через booking.update. Переход обязан идти ` +
        `через applyBookingTransition — иначе вернётся LOGIC-02 (чужой переход затирается): ` +
        `${unguarded.join(", ")}`,
    ).toEqual([]);
  });

  it("все пути записи статуса переведены на примитив", () => {
    for (const rel of [
      "src/lib/bookings/confirmBooking.ts",
      "src/lib/bookings/decline-reschedule.ts",
      "src/lib/bookings/usecases.ts",
      "src/lib/bookings/cancelBooking.ts",
      "src/lib/studio/bookings.service.ts",
      // шестой путь, которого в аудите не было — нашёл сам guard
      "src/lib/bookings/package-booking.ts",
      // седьмой — задача воркера: подтверждённый визит → FINISHED (BOOKING-FINALIZE-01)
      "src/lib/bookings/finalize-past.ts",
      // восьмой — задача воркера: неподтверждённая вовремя запись → REJECTED (PENDING-EXPIRY)
      "src/lib/bookings/expire-pending.ts",
    ]) {
      const source = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      expect(source, rel).toContain("applyBookingTransition");
    }
  });
});

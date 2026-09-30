import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { bookingStatusWrite, STATUS_WRITE_MARK } from "@/lib/testing/booking-guards";
import { hasMark, scanPrismaCalls, type PrismaCallSite } from "@/lib/testing/prisma-calls";

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
describe("LOGIC-02 · запись статуса брони — только через applyBookingTransition", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

  /**
   * 29.09 доработки · 14 (UPDATE-MANY-STATUS-WRITE) — сторож по месту вызова на
   * общем AST-разборщике (`lib/testing/prisma-calls.ts` + правила
   * `lib/testing/booking-guards.ts`) вместо регекспа
   * `/booking\.update\(\{[\s\S]{0,400}?status:/`. Регексп не видел
   * `updateMany`, `upsert`, аргумент, собранный заранее, и делегат в переменной,
   * а расширить его до `update(?:Many)?` было нельзя — он краснел на
   * `reminders.ts`, где `status:` попадал в окно из соседнего запроса.
   *
   * Правило: для `booking.update | updateMany | upsert` (у `upsert` —
   * `update` и `create`) `data`, разрешённая до литералов (идентификатор — до
   * инициализатора в той же функции, `?:` — обе ветки, спред литерала —
   * развёрнут), с ключом `status` допустима только в `transition.ts`.
   * Неразрешимая `data` (параметр, вызов, спред неизвестного) и непроверяемый
   * сайт (`const b = tx.booking; b.update(…)`, `tx["booking"]`) — нарушение, если
   * на инструкции нет `// booking-status-write-ok: <причина>`.
   *
   * FIX-C6 рассматривал перевод в тип (сузить `data` у делегата) и отказался по
   * замеру: рукописное зеркало генерённых дженериков Prisma на три метода,
   * сообщение компилятора без имени поля, и сторож всё равно нужен для пулового
   * клиента. Решение в силе.
   *
   * Слепые формы: делегат, полученный из функции ДРУГОГО модуля (`getDb().booking`
   * виден, но `const d = getDelegate(); d.update(…)` — нет); аргумент, собранный в
   * другом модуле и переданный параметром, разрешается в «неразрешимо» и требует
   * отметку — то есть не слеп, а громок; сырой SQL (`$executeRaw` с
   * `UPDATE "Booking"`).
   *
   * @probe 2026-09-29 — A/B на `lib/bookings/reminders.ts` (по одной оси):
   *        (1) в одну ветку `?:` его `data` добавлен `status: "REJECTED"` —
   *        красный «status пишет только примитив» (`reminders.ts:229`) и
   *        контроль «reminders.ts … чист»;
   *        (2) тот же `status` через `const args = { where, data: { ...data,
   *        status } }; tx.booking.updateMany(args)` — красный (`reminders.ts:230`);
   *        (3) `const b = tx.booking; b.updateMany(…)` — красный «неразрешимое
   *        и непроверяемое — только с отметкой» (делегат в переменной);
   *        исходный файл — зелёный (контроль: на нём сгорел регексп).
   */
  const PRIMITIVE = "src/lib/bookings/transition.ts";

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

  const parsed = walk("src")
    .map((rel) => ({ rel, text: readFileSync(resolve(PROJECT_ROOT, rel), "utf8") }))
    .filter((f) => /booking\b/.test(f.text))
    .map((f) => scanPrismaCalls(f.rel, f.text, "booking"));
  const writes = parsed.flatMap((p) =>
    p.calls
      .map((site) => ({ site, verdict: bookingStatusWrite(site) }))
      .filter((w): w is { site: PrismaCallSite; verdict: string } => w.verdict !== null),
  );
  const where = (site: { file: string; line: number }) => `${site.file}:${site.line}`;

  it("обход не вакуумный; reminders.ts разрешается до литералов и чист", () => {
    expect(writes.length).toBeGreaterThanOrEqual(5);
    const reminders = writes.filter((w) => w.site.file === "src/lib/bookings/reminders.ts");
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.map((w) => w.verdict)).toEqual(reminders.map(() => "clean"));
  });

  it("status пишет только примитив", () => {
    const offenders = writes
      .filter((w) => w.verdict === "status" && w.site.file !== PRIMITIVE)
      .filter((w) => !hasMark(w.site.marks, STATUS_WRITE_MARK))
      .map((w) => where(w.site));
    expect(
      offenders,
      `Запись статуса брони мимо applyBookingTransition — вернётся LOGIC-02 (чужой переход затирается): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("неразрешимое и непроверяемое — только с отметкой на инструкции", () => {
    const unresolved = writes
      .filter((w) => w.verdict.startsWith("unresolved") && w.site.file !== PRIMITIVE)
      .filter((w) => !hasMark(w.site.marks, STATUS_WRITE_MARK))
      .map((w) => `${where(w.site)} (${w.verdict})`);
    const uncheckable = parsed
      .flatMap((p) => p.uncheckable)
      .filter((u) => !hasMark(u.marks, STATUS_WRITE_MARK))
      .map((u) => `${where(u)} (${u.reason})`);
    expect(
      [...unresolved, ...uncheckable],
      `Разборщик не может доказать, что здесь не пишется status. Разверните data в литерал ` +
        `или отметьте инструкцию «// ${STATUS_WRITE_MARK}: <причина>»`,
    ).toEqual([]);
  });

  it("все пути перехода зовут примитив", () => {
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
      // форма вызова, а не имя (импорт имени не доказывает перехода)
      expect(source, rel).toContain("applyBookingTransition(");
    }
  });
});

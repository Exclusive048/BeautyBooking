import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

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

  /** Подпись перехода: запись поля `status` в `booking.update`. */
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

  const writers = walk("src").filter((rel) =>
    STATUS_WRITE.test(readFileSync(resolve(PROJECT_ROOT, rel), "utf8")),
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

  it("все шесть путей записи статуса переведены на примитив", () => {
    for (const rel of [
      "src/lib/bookings/confirmBooking.ts",
      "src/lib/bookings/decline-reschedule.ts",
      "src/lib/bookings/usecases.ts",
      "src/lib/bookings/cancelBooking.ts",
      "src/lib/studio/bookings.service.ts",
      // шестой путь, которого в аудите не было — нашёл сам guard
      "src/lib/bookings/package-booking.ts",
    ]) {
      const source = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      expect(source, rel).toContain("applyBookingTransition");
    }
  });
});

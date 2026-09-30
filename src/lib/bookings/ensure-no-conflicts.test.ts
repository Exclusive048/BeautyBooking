import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ensureNoConflicts } from "@/lib/bookings/booking-core";

/**
 * 29.09 доработки · 14 — `ensureNoConflicts` стала единственной проверкой
 * пересечения перед записью брони: пять копий (предложение и подтверждение
 * переноса, создание и перенос в кабинете студии, подтверждение модель-оффера)
 * переведены на неё. Здесь — то, что копии добавили к её контракту: своя строка
 * при переносе не конфликт (`excludeBookingId`), текст отказа — поверхности
 * (`message`), занятость читается ТЕМ ЖЕ клиентом, что брони (внутри транзакции
 * это часть её набора чтения; в `confirmBooking` копия читала её `prisma` снаружи).
 */

type Row = { id: string; status: string; startAtUtc: Date; endAtUtc: Date };

function fakeDb(rows: Row[]) {
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where as {
      id?: { not: string };
      status: { notIn: string[] };
      startAtUtc: { lt: Date };
      endAtUtc: { gt: Date };
    };
    return rows.filter(
      (r) =>
        (!w.id || r.id !== w.id.not) &&
        !w.status.notIn.includes(r.status) &&
        r.startAtUtc < w.startAtUtc.lt &&
        r.endAtUtc > w.endAtUtc.gt,
    );
  });
  const providerFindUnique = vi.fn(async () => ({ type: "MASTER", owner: { providers: [{ id: "m-1" }] } }));
  const timeBlockFindFirst = vi.fn(async () => null);
  return {
    db: {
      booking: { findMany },
      provider: { findUnique: providerFindUnique },
      timeBlock: { findFirst: timeBlockFindFirst },
    },
    findMany,
    providerFindUnique,
    timeBlockFindFirst,
  };
}

const T = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
const OWN: Row = { id: "own", status: "CONFIRMED", startAtUtc: T(10), endAtUtc: T(11) };
const OTHER: Row = { id: "other", status: "CONFIRMED", startAtUtc: T(12), endAtUtc: T(13) };
const BASE = { providerId: "m-1", masterProviderId: "m-1", bufferMin: 0 };

describe("ensureNoConflicts", () => {
  it("своя строка при переносе не конфликт", async () => {
    const { db } = fakeDb([OWN]);
    await expect(
      ensureNoConflicts(db as never, { ...BASE, startAtUtc: T(10.5), endAtUtc: T(11.5), excludeBookingId: "own" }),
    ).resolves.toBeUndefined();
  });

  it("чужая строка — 409 SLOT_CONFLICT с текстом поверхности", async () => {
    const { db } = fakeDb([OWN, OTHER]);
    await expect(
      ensureNoConflicts(db as never, {
        ...BASE,
        startAtUtc: T(12.5),
        endAtUtc: T(13.5),
        excludeBookingId: "own",
        message: "Это время уже занято. Выберите другое.",
      }),
    ).rejects.toMatchObject({ status: 409, code: "SLOT_CONFLICT", message: "Это время уже занято. Выберите другое." });
  });

  it("без исключения своя строка конфликтует — создание не знает о переносе", async () => {
    const { db } = fakeDb([OWN]);
    await expect(ensureNoConflicts(db as never, { ...BASE, startAtUtc: T(10.5), endAtUtc: T(11.5) })).rejects.toMatchObject({
      code: "SLOT_CONFLICT",
    });
  });

  it("занятость и закрытое время читаются тем же клиентом, что брони", async () => {
    const fake = fakeDb([]);
    await ensureNoConflicts(fake.db as never, { ...BASE, startAtUtc: T(9), endAtUtc: T(10) });
    expect(fake.providerFindUnique).toHaveBeenCalledTimes(1);
    expect(fake.timeBlockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("закрытое время — 409 TIME_BLOCKED", async () => {
    const fake = fakeDb([]);
    fake.timeBlockFindFirst.mockResolvedValueOnce({ id: "b" } as never);
    await expect(
      ensureNoConflicts(fake.db as never, { ...BASE, startAtUtc: T(9), endAtUtc: T(10) }),
    ).rejects.toMatchObject({ status: 409, code: "TIME_BLOCKED" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DEV-SCENARIO-01 — «Свободно сегодня» считается так же, как окошки клиента.
 *
 * Замер dev 2026-10-01 18:10 МСК: мастер с графиком 10–20 и «минимум за 2 ч»
 * видел «3 окошка, после 18:10», а клиент в ту же минуту — «На сегодня
 * свободных окошек не осталось». Плитка считала куски рабочего окна от текущей
 * минуты мимо движка окошек.
 *
 * @probe 2026-10-01: вернуть в вызов `operatorWindow: true` → красный
 *        «клиентское окно»; убрать фильтр включённых услуг → красный «только
 *        включённые услуги».
 */

const findUnique = vi.hoisted(() => vi.fn());
const listBookableSlots = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique } } }));
vi.mock("@/lib/schedule/bookable-window", () => ({ listBookableSlots }));

import { countClientFreeSlotsToday } from "@/lib/master/free-today";

const NOW = new Date("2026-10-01T07:00:00.000Z"); // 10:00 МСК

beforeEach(() => {
  findUnique.mockReset();
  listBookableSlots.mockReset();
});

describe("countClientFreeSlotsToday", () => {
  it("без включённых услуг записаться нельзя — 0", async () => {
    findUnique.mockResolvedValue({ id: "m1", timezone: "Europe/Moscow", minBookingHoursAhead: 2, services: [] });
    await expect(countClientFreeSlotsToday("m1", NOW)).resolves.toEqual({ count: 0, firstFreeAt: null });
    expect(listBookableSlots).not.toHaveBeenCalled();
  });

  it("клиентское окно на сегодня в поясе салона, самая короткая услуга", async () => {
    findUnique.mockResolvedValue({
      id: "m1",
      timezone: "Europe/Moscow",
      minBookingHoursAhead: 2,
      services: [{ id: "s-short", durationMin: 30 }],
    });
    listBookableSlots.mockResolvedValue({
      ok: true,
      slots: [
        { startAtUtc: new Date("2026-10-01T09:00:00.000Z") },
        { startAtUtc: new Date("2026-10-01T09:30:00.000Z") },
      ],
      meta: {},
    });

    await expect(countClientFreeSlotsToday("m1", NOW)).resolves.toEqual({ count: 2, firstFreeAt: "12:00" });

    const call = listBookableSlots.mock.calls[0]![0];
    expect(call, "клиентское окно").not.toHaveProperty("operatorWindow");
    expect(call).toMatchObject({
      serviceId: "s-short",
      durationMinutes: 30,
      fromKey: "2026-10-01",
      toKeyExclusive: "2026-10-02",
      provider: { minBookingHoursAhead: 2 },
    });
    const select = findUnique.mock.calls[0]![0].select;
    expect(select.services.where, "только включённые услуги").toEqual({ isEnabled: true, isActive: true });
    expect(select.services.orderBy[0]).toEqual({ durationMin: "asc" });
  });

  it("окошек не осталось — 0", async () => {
    findUnique.mockResolvedValue({
      id: "m1",
      timezone: "Europe/Moscow",
      minBookingHoursAhead: 2,
      services: [{ id: "s", durationMin: 60 }],
    });
    listBookableSlots.mockResolvedValue({ ok: true, slots: [], meta: {} });
    await expect(countClientFreeSlotsToday("m1", NOW)).resolves.toEqual({ count: 0, firstFreeAt: null });
  });
});

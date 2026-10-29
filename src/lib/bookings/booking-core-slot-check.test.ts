import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SLOTS-FLUSH-STARTS (2026-10-29) — проверка окошка в `resolveBookingCore`
 * отвечает «свободно ли время и проходит ли правила», а не «стоит ли оно на
 * сетке шага». Начало «впритык» держится на соседе (записи, перерыве,
 * блокировке): соседа сняли — и время, которое клиент уже выбрал, пропадает из
 * выдачи дня, хотя оно свободно. Поэтому время, которого нет в обычной выдаче,
 * проверяется само — дополнительным началом тем же движком.
 *
 * @probe 2026-10-29 — второй вызов `loadDaySlots([startAtUtc])` убран (проверка
 * только по выдаче дня): красный «время пропало из выдачи…» (409 вместо записи).
 * Сравнение конца окошка ослаблено до сравнения начала: красный «конец не
 * совпадает с длительностью…». Возвращено — зелёный.
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const serviceFindUnique = vi.hoisted(() => vi.fn());
const listSlots = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique },
    service: { findUnique: serviceFindUnique },
  },
}));
vi.mock("@/lib/schedule/usecases", () => ({ listAvailabilitySlotsPaginated: listSlots }));

import { resolveBookingCore } from "@/lib/bookings/booking-core";

const MASTER = {
  id: "m1",
  type: "MASTER",
  ownerUserId: "u-master",
  isPublished: true,
  studioPaused: false,
  timezone: "Europe/Moscow",
  studioId: null,
  autoConfirmBookings: false,
  bufferBetweenBookingsMin: 0,
  minBookingHoursAhead: 0,
  maxBookingDaysAhead: 60,
  acceptNewClients: true,
};
const SERVICE = {
  id: "svc",
  providerId: "m1",
  title: null,
  name: "Мужская стрижка",
  isEnabled: true,
  isActive: true,
  durationMin: 20,
  baseDurationMin: null,
  price: 150_000,
  basePrice: null,
  provider: { type: "MASTER" },
};

// Завтра, 7:20 по Москве (04:20Z): время «сразу после» записи на 7:00.
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const START = new Date(`${tomorrow}T04:20:00.000Z`);
const END = new Date(START.getTime() + 20 * 60 * 1000);

function slot(start: Date, durationMin = 20) {
  return { startAtUtc: start.toISOString(), endAtUtc: new Date(start.getTime() + durationMin * 60_000).toISOString() };
}

function daySlots(slots: ReturnType<typeof slot>[]) {
  return { ok: true as const, data: { slots, meta: {} } };
}

function core(input: { endAtUtc?: Date } = {}) {
  return resolveBookingCore({
    providerId: "m1",
    serviceId: "svc",
    masterProviderId: null,
    clientUserId: "u-client",
    startAtUtc: START,
    endAtUtc: input.endAtUtc,
  });
}

beforeEach(() => {
  providerFindUnique.mockReset();
  providerFindUnique.mockResolvedValue(MASTER);
  serviceFindUnique.mockReset();
  serviceFindUnique.mockResolvedValue(SERVICE);
  listSlots.mockReset();
});

describe("resolveBookingCore · проверка окошка — «свободно и по правилам», а не «на сетке»", () => {
  it("время из обычной выдачи дня — один расчёт", async () => {
    listSlots.mockResolvedValue(daySlots([slot(START)]));

    await expect(core()).resolves.toMatchObject({ startAtUtc: START, endAtUtc: END });
    expect(listSlots).toHaveBeenCalledTimes(1);
    expect(listSlots.mock.calls[0]?.[3]).toMatchObject({ extraStartsUtc: undefined });
  });

  it("время пропало из выдачи (сосед снят), но свободно — проверяется само и проходит", async () => {
    // Запись на 7:00 отменили: в выдаче дня только сетка 7:15 / 7:30.
    const grid = [slot(new Date(START.getTime() - 5 * 60_000)), slot(new Date(START.getTime() + 10 * 60_000))];
    listSlots.mockImplementation(async (_p: string, _s: string, _d: number, input: { extraStartsUtc?: Date[] }) =>
      daySlots(input.extraStartsUtc ? [...grid, slot(START)] : grid),
    );

    await expect(core()).resolves.toMatchObject({ startAtUtc: START, endAtUtc: END });
    expect(listSlots).toHaveBeenCalledTimes(2);
    expect(listSlots.mock.calls[1]?.[3]).toMatchObject({ extraStartsUtc: [START] });
  });

  it("время занято и как отдельное начало — отказ «кто-то записался первым»", async () => {
    listSlots.mockResolvedValue(daySlots([]));

    await expect(core()).rejects.toMatchObject({ status: 409, code: "SLOT_CONFLICT" });
    expect(listSlots).toHaveBeenCalledTimes(2);
  });

  it("конец не совпадает с длительностью, которую выводит сервер, — отказ", async () => {
    // Клиент сжал 20-минутную услугу до 5 минут: начало свободно, конец — нет.
    listSlots.mockResolvedValue(daySlots([slot(START)]));

    await expect(core({ endAtUtc: new Date(START.getTime() + 5 * 60_000) })).rejects.toMatchObject({
      status: 409,
      code: "SLOT_CONFLICT",
    });
  });
});

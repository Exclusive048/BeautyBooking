import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SLOTS-FLUSH-STARTS (2026-10-29) — проверка окошка в `resolveBookingCore`:
 * время записи — одно из начал, которые предлагает движок (сетка шага,
 * «впритык» к занятому, начала пакета, выведенные сервером). Произвольное
 * свободное время мимо «Шага окошек» мастера не принимается. Исключение одно:
 * начало «впритык», чей сосед (запись) только что снят, — оно свободно, но из
 * выдачи пропало, и проверяется само тем же движком.
 *
 * @probe 2026-10-29 — условие «пропал сосед» снято (вторая проверка на любое
 * время): красный «свободное время мимо шага окошек…» (запись прошла вместо 409).
 * Начала сервера не переданы в первую проверку: красный «следующая услуга
 * пакета…». Сравнение конца ослаблено до начала: красный «конец не совпадает…».
 * Возвращено — зелёный.
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const serviceFindUnique = vi.hoisted(() => vi.fn());
const bookingFindFirst = vi.hoisted(() => vi.fn());
const listSlots = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique },
    service: { findUnique: serviceFindUnique },
    booking: { findFirst: bookingFindFirst },
  },
}));
vi.mock("@/lib/schedule/usecases", () => ({ listAvailabilitySlotsPaginated: listSlots }));
vi.mock("@/lib/schedule/occupancy", () => ({
  normalizeOccupancyIds: (ids: readonly string[]) => Array.from(new Set(ids)),
  resolveOccupancyProviderIds: async (_db: unknown, id: string) => [id],
}));

import { resolveBookingCore } from "@/lib/bookings/booking-core";

const BUFFER_MIN = 5;
const MASTER = {
  id: "m1",
  type: "MASTER",
  ownerUserId: "u-master",
  isPublished: true,
  studioPaused: false,
  timezone: "Europe/Moscow",
  studioId: null,
  autoConfirmBookings: false,
  bufferBetweenBookingsMin: BUFFER_MIN,
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

// Завтра, 7:25 по Москве (04:25Z): время «сразу после» записи 7:00–7:20 с паузой 5 минут.
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const START = new Date(`${tomorrow}T04:25:00.000Z`);
const END = new Date(START.getTime() + 20 * 60 * 1000);

function slot(start: Date, durationMin = 20) {
  return { startAtUtc: start.toISOString(), endAtUtc: new Date(start.getTime() + durationMin * 60_000).toISOString() };
}

function daySlots(slots: ReturnType<typeof slot>[]) {
  return { ok: true as const, data: { slots, meta: {} } };
}

// Сетка 7:15 / 7:30 — START (7:25) в ней нет.
const GRID = [slot(new Date(START.getTime() - 10 * 60_000)), slot(new Date(START.getTime() + 5 * 60_000))];

/** Движок: START свободно, но предлагается только дополнительным началом. */
function engineWithFreeStart() {
  listSlots.mockImplementation(async (_p: string, _s: string, _d: number, input: { extraStartsUtc?: Date[] }) =>
    daySlots(input.extraStartsUtc?.some((value) => value.getTime() === START.getTime()) ? [...GRID, slot(START)] : GRID),
  );
}

function core(input: { endAtUtc?: Date; extraStartsUtc?: Date[] } = {}) {
  return resolveBookingCore({
    providerId: "m1",
    serviceId: "svc",
    masterProviderId: null,
    clientUserId: "u-client",
    startAtUtc: START,
    endAtUtc: input.endAtUtc,
    extraStartsUtc: input.extraStartsUtc,
  });
}

beforeEach(() => {
  providerFindUnique.mockReset();
  providerFindUnique.mockResolvedValue(MASTER);
  serviceFindUnique.mockReset();
  serviceFindUnique.mockResolvedValue(SERVICE);
  bookingFindFirst.mockReset();
  bookingFindFirst.mockResolvedValue(null);
  listSlots.mockReset();
});

describe("resolveBookingCore · проверка окошка — начала движка, а не любое свободное время", () => {
  it("время из обычной выдачи дня — один расчёт, соседей не ищем", async () => {
    listSlots.mockResolvedValue(daySlots([slot(START)]));

    await expect(core()).resolves.toMatchObject({ startAtUtc: START, endAtUtc: END });
    expect(listSlots).toHaveBeenCalledTimes(1);
    expect(listSlots.mock.calls[0]?.[3]).toMatchObject({ extraStartsUtc: undefined });
    expect(bookingFindFirst).not.toHaveBeenCalled();
  });

  it("свободное время мимо шага окошек без пропавшего соседа — отказ, второго расчёта нет", async () => {
    // Прямой запрос к API на 7:25 при пустом дне: время свободно, но движок его не предлагает.
    engineWithFreeStart();

    await expect(core()).rejects.toMatchObject({ status: 409, code: "SLOT_CONFLICT" });
    expect(listSlots).toHaveBeenCalledTimes(1);
  });

  it("сосед снят, пока клиент оформлялся, — начало впритык к нему проверяется само и проходит", async () => {
    // Запись 7:00–7:20 отменили: в выдаче дня только сетка 7:15 / 7:30.
    engineWithFreeStart();
    bookingFindFirst.mockResolvedValue({ id: "cancelled" });

    await expect(core()).resolves.toMatchObject({ startAtUtc: START, endAtUtc: END });
    expect(listSlots).toHaveBeenCalledTimes(2);
    expect(listSlots.mock.calls[1]?.[3]).toMatchObject({ extraStartsUtc: [START] });

    // Сосед — только снятая запись этого мастера, вплотную с его паузой, и недавно.
    const where = bookingFindFirst.mock.calls[0]?.[0]?.where;
    expect(where.status).toEqual({ in: ["REJECTED", "CANCELLED"] });
    expect(where.updatedAt.gte).toBeInstanceOf(Date);
    expect(where.AND[1]).toEqual({
      OR: [
        { endAtUtc: new Date(START.getTime() - BUFFER_MIN * 60_000) },
        { startAtUtc: new Date(END.getTime() + BUFFER_MIN * 60_000) },
      ],
    });
  });

  it("сосед снят, но время занято и как отдельное начало — отказ «кто-то записался первым»", async () => {
    listSlots.mockResolvedValue(daySlots(GRID));
    bookingFindFirst.mockResolvedValue({ id: "cancelled" });

    await expect(core()).rejects.toMatchObject({ status: 409, code: "SLOT_CONFLICT" });
    expect(listSlots).toHaveBeenCalledTimes(2);
  });

  it("следующая услуга пакета: начало, выведенное сервером, идёт в первый же расчёт", async () => {
    engineWithFreeStart();

    await expect(core({ extraStartsUtc: [START] })).resolves.toMatchObject({ startAtUtc: START });
    expect(listSlots).toHaveBeenCalledTimes(1);
    expect(listSlots.mock.calls[0]?.[3]).toMatchObject({ extraStartsUtc: [START] });
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

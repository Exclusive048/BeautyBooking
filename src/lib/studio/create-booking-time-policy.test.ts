import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 07 — «Новая запись» админа студии проходит политику времени
 * ДО транзакции записи: дальше «максимума» (строже из студии и мастера) —
 * отказ без единой вставки; прошедшее время — допустимо (решение владельца).
 *
 * @probe 2026-09-29 — в `createStudioBooking` окно заменено окном одного
 * мастера (`stricterBookingWindow(masterRow, masterRow)`): покраснел «дальше
 * максимума СТУДИИ — отказ до транзакции» (транзакция вызвана). Возвращено — зелёный.
 */

const bookingTransaction = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const REACHED_TX = vi.hoisted(() => new Error("reached-transaction"));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: vi.fn(async () => ({ id: "studio-row", providerId: "studio-prov" })) },
    service: {
      findFirst: vi.fn(async () => ({
        id: "svc",
        name: "Стрижка",
        title: null,
        price: 150_000,
        durationMin: 60,
        basePrice: null,
        baseDurationMin: null,
        isActive: true,
        isEnabled: true,
      })),
    },
    masterService: { findUnique: vi.fn(async () => ({ isEnabled: true, priceOverride: null, durationOverrideMin: null })) },
    provider: { findUnique: providerFindUnique },
    booking: { count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/studio/accepts-bookings", () => ({ assertStudioAcceptsBookings: vi.fn(async () => undefined) }));
vi.mock("@/lib/studio/master-eligibility", () => ({
  requireActiveStudioMaster: vi.fn(async () => ({ id: "m1", timezone: "Europe/Moscow" })),
}));
vi.mock("@/lib/schedule/master-work-window", () => ({
  resolveMasterWorkWindow: vi.fn(async () => ({ isActive: true, startMinutes: 0, endMinutes: 24 * 60 })),
}));
vi.mock("@/lib/bookings/booking-transaction", () => ({ bookingTransaction }));

import { createStudioBooking } from "@/lib/studio/bookings.service";

const DAY = 86_400_000;

beforeEach(() => {
  // Полдень по UTC: «через 30 минут» + длительность не переходит полночь салона.
  // Без закреплённых часов тест краснел после ~22:30 (окно мастера 0–24 ч).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T09:00:00Z"));
  vi.clearAllMocks();
  bookingTransaction.mockRejectedValue(REACHED_TX);
  providerFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "studio-prov"
      ? { minBookingHoursAhead: 0, maxBookingDaysAhead: 14, acceptNewClients: true }
      : { minBookingHoursAhead: 3, maxBookingDaysAhead: 60, acceptNewClients: true, bufferBetweenBookingsMin: 0 },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

function create(startAt: Date) {
  return createStudioBooking({
    studioId: "studio-row",
    masterId: "m1",
    startAt,
    serviceId: "svc",
    clientName: "Елена",
    clientPhone: "+79995000000",
  });
}

describe("«Новая запись» админа студии — политика времени", () => {
  it("дальше максимума СТУДИИ — отказ до транзакции", async () => {
    await expect(create(new Date(Date.now() + 20 * DAY))).rejects.toMatchObject({ code: "BOOKING_TOO_FAR" });
    expect(bookingTransaction).not.toHaveBeenCalled();
  });

  it("через 30 минут при «минимум за 3 ч» у мастера — доходит до записи", async () => {
    await expect(create(new Date(Date.now() + 30 * 60_000))).rejects.toBe(REACHED_TX);
    expect(bookingTransaction).toHaveBeenCalledTimes(1);
  });

  it("прошедший визит — доходит до записи (занести задним числом можно)", async () => {
    await expect(create(new Date(Date.now() - DAY))).rejects.toBe(REACHED_TX);
    expect(bookingTransaction).toHaveBeenCalledTimes(1);
  });
});

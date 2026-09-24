import { describe, it, expect, vi } from "vitest";

/**
 * MANUAL-BOOKING-SLOTS-01 — `listBookableSlots({ operatorWindow })` снимает
 * ТОЛЬКО отсечку `minBookingHoursAhead`; прошедшие окошки прячутся всегда.
 * Проба — в шапке `app/api/masters/availability-operator-window.test.ts`.
 */

const NOW = new Date("2026-09-23T09:00:00.000Z");
const PAST = "2026-09-23T08:00:00.000Z";
const SOON = "2026-09-23T09:30:00.000Z"; // раньше отсечки «за 2 часа»
const LATER = "2026-09-23T14:00:00.000Z";
const FAR = "2026-10-10T10:00:00.000Z"; // за горизонтом двухнедельного окна

vi.mock("@/lib/schedule/usecases", () => ({
  listAvailabilitySlotsPaginated: vi.fn(async () => ({
    ok: true as const,
    data: {
      slots: [PAST, SOON, LATER, FAR].map((startAtUtc) => ({
        startAtUtc,
        endAtUtc: startAtUtc,
        label: startAtUtc,
      })),
      meta: { fromDate: "2026-09-23", toDateExclusive: "2026-09-24" },
    },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    weeklyScheduleConfig: { findUnique: vi.fn(async () => null) },
    scheduleOverride: { findMany: vi.fn(async () => []) },
  },
}));

import { listBookableSlots } from "@/lib/schedule/bookable-window";

async function starts(operatorWindow?: boolean): Promise<string[]> {
  const result = await listBookableSlots({
    provider: { id: "prov1", timezone: "Europe/Moscow", minBookingHoursAhead: 2 },
    serviceId: "svc1",
    durationMinutes: 60,
    fromKey: "2026-09-23",
    now: NOW,
    operatorWindow,
  });
  if (!result.ok) throw new Error(result.message);
  return result.slots.map((slot) => String(slot.startAtUtc));
}

describe("listBookableSlots · окно оператора", () => {
  it("без флага — окошко раньше отсечки скрыто", async () => {
    expect(await starts()).toEqual([LATER, FAR]);
  });

  it("с флагом — ближайшее окошко видно, прошедшее нет", async () => {
    expect(await starts(true)).toEqual([SOON, LATER, FAR]);
  });
});

/**
 * BOOKING-WINDOW-SPLIT — `windowPolicy` (окно владельца услуги) заменяет
 * отсечку провайдера и добавляет верхнюю границу `maxBookingDaysAhead`.
 *
 * @probe 2026-09-24 — строка `if (latestBookable && …) return false` удалена:
 * красный «максимум владельца услуги режет дальние окошки».
 */
describe("listBookableSlots · окно владельца услуги", () => {
  async function withPolicy(policy: { minBookingHoursAhead: number; maxBookingDaysAhead: number }) {
    const result = await listBookableSlots({
      provider: { id: "prov1", timezone: "Europe/Moscow", minBookingHoursAhead: 2 },
      serviceId: "svc1",
      durationMinutes: 60,
      fromKey: "2026-09-23",
      now: NOW,
      windowPolicy: policy,
    });
    if (!result.ok) throw new Error(result.message);
    return result.slots.map((slot) => String(slot.startAtUtc));
  }

  it("минимум владельца заменяет минимум мастера", async () => {
    // мастер пустил бы LATER (через 5 ч), а у студии минимум — 6 ч
    expect(await withPolicy({ minBookingHoursAhead: 6, maxBookingDaysAhead: 30 })).toEqual([FAR]);
    // у студии минимум 0 — видно и ближайшее, прошедшее по-прежнему нет
    expect(await withPolicy({ minBookingHoursAhead: 0, maxBookingDaysAhead: 30 })).toEqual([SOON, LATER, FAR]);
  });

  it("максимум владельца услуги режет дальние окошки", async () => {
    // две недели вперёд: окошко 10 октября за горизонтом
    expect(await withPolicy({ minBookingHoursAhead: 0, maxBookingDaysAhead: 14 })).toEqual([SOON, LATER]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/public/providers/{id}/slots` (виджет мастера):
 *  - SLOTS-MAX-AHEAD — окошки в окне записи, которое проверит запись: строже из
 *    владельца услуги и мастера (раньше «Максимум вперёд» здесь не действовал);
 *  - BOOKING-WINDOW-MERGE — выдача обрезается по последнему дню того же окна
 *    (отдельного «Сколько окошек вперёд» больше нет);
 *  - SLOTS-RANGE-CLAMP — день за окном записи — пустая выдача, а не 400
 *    «Проверьте выбранный период»;
 *  - BOOKING-DATE-CALENDAR — `?days=1` отдаёт сводку дней тем же окном.
 *
 * @probe 2026-11-13 — `windowPolicy` не передаётся в `listBookableSlots`:
 * покраснел «окно записи — строже из владельца услуги и мастера». Без прижатия
 * конца к началу: покраснел «день за горизонтом видимости».
 *
 * @probe 2026-11-14 — обрезка по окну мастера (`provider`), а не по строгому
 * из двух: покраснели оба теста с границей 2026-10-08 (уехала на 2026-11-30).
 */

const listBookableSlots = vi.hoisted(() => vi.fn());
const listBookableDays = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/resolve-provider", () => ({
  resolveProviderBySlugOrId: () =>
    Promise.resolve({
      id: "prov1",
      type: "MASTER",
      timezone: "Asia/Yekaterinburg",
      minBookingHoursAhead: 0,
      maxBookingDaysAhead: 60,
    }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: {
      findUnique: vi.fn(async () => ({
        id: "svc1",
        price: 100_000,
        provider: { minBookingHoursAhead: 2, maxBookingDaysAhead: 7 },
      })),
    },
    discountRule: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/schedule/resolveDuration", () => ({
  resolveServiceDuration: vi.fn(async () => ({ ok: true as const, data: 60 })),
}));
vi.mock("@/lib/schedule/reschedule-exclusion", () => ({
  resolveRescheduleExclusion: vi.fn(async () => null),
}));
vi.mock("@/lib/studio/active-studio-master", () => ({
  isActiveMasterOfPublishedStudio: vi.fn(async () => false),
}));
vi.mock("@/lib/schedule/bookable-window", () => ({
  listBookableSlots: (...args: unknown[]) => {
    listBookableSlots(...args);
    return Promise.resolve({ ok: true as const, slots: [], meta: {} });
  },
}));
vi.mock("@/lib/schedule/bookable-days", () => ({
  listBookableDays: (...args: unknown[]) => {
    listBookableDays(...args);
    return Promise.resolve({
      ok: true as const,
      data: { timezone: "Asia/Yekaterinburg", firstDate: "2026-09-30", lastDate: "2026-10-06", days: [] },
    });
  },
}));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { GET } from "@/app/api/public/providers/[providerId]/slots/route";

// 2026-09-29T20:30Z — уже 30 сентября в Екатеринбурге (01:30).
const NOW = new Date("2026-09-29T20:30:00Z");

async function get(query: string) {
  return GET(new Request(`http://localhost/api/public/providers/prov1/slots?serviceId=svc1${query}`), {
    params: Promise.resolve({ providerId: "prov1" }),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  listBookableSlots.mockClear();
  listBookableDays.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/slots — окно записи виджета мастера", () => {
  it("окно записи — строже из владельца услуги и мастера (SLOTS-MAX-AHEAD)", async () => {
    const res = await get("&from=2026-09-30");
    expect(res.status).toBe(200);
    const input = listBookableSlots.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(input.windowPolicy).toEqual({ minBookingHoursAhead: 2, maxBookingDaysAhead: 7 });
    // Запись открыта до 07.10 01:30 по салону — последний день 07.10.
    expect(input.toKeyExclusive).toBe("2026-10-08");
  });

  it("день за окном записи — пустая выдача, а не 400 (SLOTS-RANGE-CLAMP)", async () => {
    const res = await get("&from=2026-10-10&limit=1");
    expect(res.status).toBe(200);
    const input = listBookableSlots.mock.calls.at(-1)?.[0] as { fromKey: string; toKeyExclusive?: string };
    expect(input.fromKey).toBe("2026-10-10");
    expect(input.toKeyExclusive).toBe("2026-10-10");
  });

  it("?days=1 — сводка дней тем же окном (BOOKING-DATE-CALENDAR)", async () => {
    const res = await get("&from=2026-09-30&days=1");
    expect(res.status).toBe(200);
    expect(listBookableSlots).not.toHaveBeenCalled();
    const input = listBookableDays.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      fromKey: "2026-09-30",
      toKeyExclusive: "2026-10-08",
      durationMinutes: 60,
      windowPolicy: { minBookingHoursAhead: 2, maxBookingDaysAhead: 7 },
    });
    const body = (await res.json()) as { data: { firstDate: string } };
    expect(body.data.firstDate).toBe("2026-09-30");
  });
});

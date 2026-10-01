import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Итоги недели» мастеру: сумма в рублях из копеек и записи всех рабочих
 * профилей человека (личный + профили в студиях), по одной сводке на человека.
 *
 * @probe 2026-09-29 — в задаче сумма снова передана как
 * `${revenueKopeks.toLocaleString("ru-RU")} ₽` (копейки печатаются как рубли):
 * покраснел «4 500 ₽ из 450 000 копеек». Возвращено — зелёный.
 * @probe 2026-09-29 — в задаче `getWeekStats(profileIds…)` заменён на
 * `getWeekStats([providerId]…)`: покраснел «записи профиля в студии входят в
 * сводку» (в условии нет профиля в студии). Возвращено — зелёный.
 */

const deliverNotification = vi.hoisted(() => vi.fn(async (_input: { body: string }) => {}));
const prismaMock = vi.hoisted(() => ({
  provider: { findMany: vi.fn() },
  booking: { findMany: vi.fn() },
}));
const claimLock = vi.hoisted(() => vi.fn(async () => ({ status: "acquired" as const })));

vi.mock("@/lib/cache/cache", () => ({ claimLock, del: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification }));
vi.mock("@/lib/telegram/config", () => ({ getAppPublicUrl: () => "https://example.test" }));
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));

const { runWeeklyStatsJob } = await import("@/lib/master/weekly-stats-job");

// Понедельник — задача работает только по понедельникам (UTC).
const MONDAY = new Date("2026-09-28T06:00:00.000Z");

type ProviderQuery = { where?: { masterProfile?: unknown; cursor?: unknown }; cursor?: unknown };

function mockProviders(options: { studioProfileIds: string[] }) {
  let batchServed = false;
  prismaMock.provider.findMany.mockImplementation(async (query: ProviderQuery) => {
    // Профили в студиях человека (`listStudioMasterProfiles`).
    if (query.where && "masterProfile" in query.where && (query.where.masterProfile as { is?: unknown }).is === null) {
      return options.studioProfileIds.map((id) => ({ id, studioId: "studio-1" }));
    }
    // Пачка личных профилей: одна страница, затем пусто.
    if (batchServed) return [];
    batchServed = true;
    return [{ id: "master-personal", ownerUserId: "user-1" }];
  });
}

function bookings(pricesKopeks: number[]) {
  return pricesKopeks.map((price) => ({ serviceItems: [{ priceSnapshot: price }] }));
}

beforeEach(() => {
  vi.clearAllMocks();
  claimLock.mockResolvedValue({ status: "acquired" });
});

describe("«Итоги недели»", () => {
  it("4 500 ₽ из 450 000 копеек", async () => {
    mockProviders({ studioProfileIds: [] });
    prismaMock.booking.findMany.mockResolvedValue(bookings([200_000, 250_000]));
    await runWeeklyStatsJob(MONDAY);
    const body = deliverNotification.mock.calls[0]?.[0]?.body ?? "";
    // 29.09 доработки · 24: перед ₽ — неразрывный пробел (решение 24.2).
    expect(body).toMatch(/2 записи, 4\s500\u00a0₽/u);
    expect(body).not.toContain("450");
  });

  it("21 запись, а не «21 записей»", async () => {
    mockProviders({ studioProfileIds: [] });
    prismaMock.booking.findMany.mockResolvedValue(bookings(Array.from({ length: 21 }, () => 100_00)));
    await runWeeklyStatsJob(MONDAY);
    const body = deliverNotification.mock.calls[0]?.[0]?.body ?? "";
    expect(body).toContain("21 запись,");
  });

  it("записи профиля в студии входят в сводку", async () => {
    mockProviders({ studioProfileIds: ["master-in-studio"] });
    prismaMock.booking.findMany.mockResolvedValue(bookings([100_00]));
    await runWeeklyStatsJob(MONDAY);
    const where = JSON.stringify(prismaMock.booking.findMany.mock.calls[0]?.[0]?.where ?? {});
    expect(where).toContain("master-personal");
    expect(where).toContain("master-in-studio");
  });

  it("сводка — по личным профилям: профиль в студии отдельной сводки не получает", async () => {
    mockProviders({ studioProfileIds: [] });
    prismaMock.booking.findMany.mockResolvedValue(bookings([100_00]));
    await runWeeklyStatsJob(MONDAY);
    const batchWhere = prismaMock.provider.findMany.mock.calls[0]?.[0]?.where;
    expect(batchWhere).toMatchObject({ masterProfile: { isNot: null } });
  });
});

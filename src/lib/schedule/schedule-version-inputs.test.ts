import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-18 — `scheduleVersion` входит в ключи `slots:*`, `dayPlan:*` и
 * `bookingDays:*`, поэтому его смена осиротняет ВЕСЬ прогретый набор
 * провайдера (все дни × все услуги × все длительности). Первым входом версии
 * был `Provider.updatedAt`, то есть её двигала любая запись в строку
 * провайдера — пересчёт рейтинга при каждом отзыве, пересчёт `availableToday`
 * (запускаемый из самого инвалидатора слотов), правка профиля.
 *
 * Пин держит обе половины фикса, и каждая обязана краснеть, если снять свою:
 *   1. версия НЕ читает строку провайдера и НЕ меняется от её `updatedAt`;
 *   2. версия по-прежнему меняется от структуры расписания (иначе п.1
 *      проходил бы вакуумно — «версия не меняется никогда» его тоже
 *      удовлетворяет);
 *   3. `slotStepMin` попал в ключ слот-кэша. Это цена п.1: шаг сетки —
 *      единственный вход `buildSlotsForDay`, который держался ТОЛЬКО на
 *      `Provider.updatedAt`, и без него смена шага отдавала бы старую сетку.
 */

const prismaMock = vi.hoisted(() => ({
  provider: { findUnique: vi.fn() },
  booking: { findMany: vi.fn() },
  timeBlock: { findMany: vi.fn() },
  weeklyScheduleConfig: { findUnique: vi.fn(), aggregate: vi.fn() },
  scheduleTemplate: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleOverride: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleBreak: { findMany: vi.fn(), aggregate: vi.fn() },
  $transaction: vi.fn(),
}));

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  delByPattern: vi.fn(async (pattern: string) => {
    const prefix = pattern.replace(/\*$/, "");
    for (const key of Array.from(store.keys())) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }),
  setNx: vi.fn(async () => true),
}));

import { getScheduleWindow } from "@/lib/schedule/engine-context";
import { buildSlotsCacheKey } from "@/lib/schedule/slotsCache";
import { invalidateScheduleVersion } from "@/lib/schedule/schedule-version-cache";

const PROVIDER_ID = "prov_18";
const TIMEZONE = "Asia/Yekaterinburg";

/** Четыре агрегата структуры расписания; `structureUpdatedAt` — их максимум. */
function primeScheduleStructure(structureUpdatedAt: Date | null): void {
  prismaMock.$transaction.mockResolvedValue([
    { _max: { updatedAt: structureUpdatedAt } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
  ]);
}

async function freshVersion(): Promise<string> {
  await invalidateScheduleVersion(PROVIDER_ID);
  const window = await getScheduleWindow(PROVIDER_ID, TIMEZONE);
  return window.scheduleVersion;
}

describe("PERF-18 · версия расписания зависит от расписания, а не от строки провайдера", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    prismaMock.provider.findUnique.mockResolvedValue({
      id: PROVIDER_ID,
      timezone: TIMEZONE,
      bufferBetweenBookingsMin: 0,
      slotStepMin: 30,
    });
  });

  it("не читает строку провайдера", async () => {
    primeScheduleStructure(new Date("2026-08-01T10:00:00.000Z"));

    await freshVersion();

    // Единственный источник версии — транзакция агрегатов; строка провайдера
    // (а с ней и её `updatedAt`) в расчёт не входит вовсе.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.provider.findUnique).not.toHaveBeenCalled();
  });

  it("не меняется, когда сдвинулся только `Provider.updatedAt`", async () => {
    primeScheduleStructure(new Date("2026-08-01T10:00:00.000Z"));
    const before = await freshVersion();

    // Отзыв → пересчёт рейтинга → запись в строку провайдера. Структура
    // расписания при этом та же самая.
    prismaMock.provider.findUnique.mockResolvedValue({
      id: PROVIDER_ID,
      timezone: TIMEZONE,
      bufferBetweenBookingsMin: 0,
      slotStepMin: 30,
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    });

    const after = await freshVersion();
    expect(after).toBe(before);
  });

  it("меняется, когда изменилась структура расписания (не вакуумно)", async () => {
    primeScheduleStructure(new Date("2026-08-01T10:00:00.000Z"));
    const before = await freshVersion();

    primeScheduleStructure(new Date("2026-08-06T09:30:00.000Z"));
    const after = await freshVersion();

    expect(after).not.toBe(before);
  });

  it("шаг сетки входит в ключ слот-кэша", () => {
    const common = {
      masterId: PROVIDER_ID,
      dateKey: "2026-09-01",
      serviceId: "svc_1",
      serviceDuration: 60,
      bufferMin: 0,
      timeZone: TIMEZONE,
      scheduleVersion: "v1",
      publishedUntilLocal: "2026-10-13",
    };

    expect(buildSlotsCacheKey({ ...common, slotStepMin: 30 })).not.toBe(
      buildSlotsCacheKey({ ...common, slotStepMin: 15 }),
    );
  });
});

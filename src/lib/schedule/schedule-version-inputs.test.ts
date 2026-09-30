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
  timeBlock: { findMany: vi.fn(), aggregate: vi.fn() },
  weeklyScheduleConfig: { findUnique: vi.fn(), aggregate: vi.fn() },
  scheduleTemplate: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleOverride: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleBreak: { findMany: vi.fn(), aggregate: vi.fn() },
  schedulePattern: { findMany: vi.fn(), aggregate: vi.fn() },
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
  claimLock: vi.fn(async () => ({ status: "acquired" })),
}));

import { getScheduleWindow } from "@/lib/schedule/engine-context";
import { buildSlotsCacheKey } from "@/lib/schedule/slotsCache";
import { invalidateScheduleVersion } from "@/lib/schedule/schedule-version-cache";

const PROVIDER_ID = "prov_18";
const TIMEZONE = "Asia/Yekaterinburg";

/**
 * Пять агрегатов структуры расписания: четыре по таблицам шаблонов/override'ов
 * и пятый — `TimeBlock` (PERF-19), у которого кроме метки времени берётся ещё
 * и счётчик строк.
 */
function primeScheduleStructure(
  structureUpdatedAt: Date | null,
  timeBlocks: { updatedAt: Date | null; count: number } = { updatedAt: null, count: 0 },
  patterns: { updatedAt: Date | null; count: number } = { updatedAt: null, count: 0 },
  overrideCount = 0,
): void {
  prismaMock.$transaction.mockResolvedValue([
    // SCHEDULE-PATTERNS-01 (этап 3): у «Особых дней» тоже счётчик.
    { _max: { updatedAt: structureUpdatedAt }, _count: overrideCount },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: timeBlocks.updatedAt }, _count: timeBlocks.count },
    // SCHEDULE-PATTERNS-01: шестой агрегат — графики (метка + счётчик).
    { _max: { updatedAt: patterns.updatedAt }, _count: patterns.count },
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

  /**
   * PERF-19 — блокировки времени участвуют в `buildSlotsForDay`, но не входили
   * ни в ключ, ни в версию: их корректность держалась ИСКЛЮЧИТЕЛЬНО на явном
   * `invalidateSlotsForMaster`, а тот путь глушит ошибки Redis. Второй слой
   * обязан ловить и создание, и снятие блокировки.
   */
  it("создание блокировки времени меняет версию", async () => {
    primeScheduleStructure(new Date("2026-08-01T10:00:00.000Z"));
    const before = await freshVersion();

    primeScheduleStructure(new Date("2026-08-01T10:00:00.000Z"), {
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
      count: 1,
    });
    const after = await freshVersion();

    expect(after).not.toBe(before);
  });

  it("снятие блокировки меняет версию, даже если максимум не сдвинулся", async () => {
    // Ровно тот случай, который `_max updatedAt` не ловит: удалили строку, не
    // бывшую максимумом. Для блокировок это норма — они временные, и снятие
    // обязано вернуть слот в выдачу.
    const blockStamp = new Date("2026-08-06T12:00:00.000Z");
    primeScheduleStructure(new Date("2026-08-01T10:00:00.000Z"), { updatedAt: blockStamp, count: 2 });
    const before = await freshVersion();

    primeScheduleStructure(new Date("2026-08-01T10:00:00.000Z"), { updatedAt: blockStamp, count: 1 });
    const after = await freshVersion();

    expect(after).not.toBe(before);
  });

  it("SCHEDULE-PATTERNS-01: новый график меняет версию", async () => {
    const base = new Date("2026-08-01T10:00:00.000Z");
    primeScheduleStructure(base);
    const before = await freshVersion();

    primeScheduleStructure(base, undefined, {
      updatedAt: new Date("2026-09-28T09:00:00.000Z"),
      count: 1,
    });
    const after = await freshVersion();

    expect(after).not.toBe(before);
  });

  it("SCHEDULE-PATTERNS-01: удаление периода графика меняет версию, даже если максимум не сдвинулся", async () => {
    const base = new Date("2026-08-01T10:00:00.000Z");
    const patternStamp = new Date("2026-09-28T09:00:00.000Z");
    primeScheduleStructure(base, undefined, { updatedAt: patternStamp, count: 3 });
    const before = await freshVersion();

    primeScheduleStructure(base, undefined, { updatedAt: patternStamp, count: 2 });
    const after = await freshVersion();

    expect(after).not.toBe(before);
  });

  it("SCHEDULE-PATTERNS-01 (этап 3): «вернуть как по графику» меняет версию, даже если максимум не сдвинулся", async () => {
    // Покраска дня — строка `ScheduleOverride`; возврат дня к графику её
    // удаляет, и удалённая строка не обязана быть максимумом по `updatedAt`.
    const base = new Date("2026-08-01T10:00:00.000Z");
    primeScheduleStructure(base, undefined, undefined, 5);
    const before = await freshVersion();

    primeScheduleStructure(base, undefined, undefined, 4);
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

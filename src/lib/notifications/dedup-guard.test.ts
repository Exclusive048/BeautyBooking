import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * FIX-C12 — отказ dedup-сторожа есть свойство ПРОГОНА, и решение по нему
 * принимается один раз, до первой доставки.
 *
 * ## Почему проверяется ПУТЬ, а не результат
 *
 * Урок FIX-C11 (проба B): если корректный и дефектный код дают ОДИН результат,
 * утверждение о результате не доказывает ничего. Здесь ровно тот случай, и он
 * тоньше, чем кажется:
 *
 *   · при отказе на ПЕРВОМ подписчике обе версии дают ноль доставок и обе
 *     бросают — то есть тест с одним подписчиком зелёный на сломанном коде;
 *   · различие видно только при отказе В СЕРЕДИНЕ: старая версия (сторож внутри
 *     цикла доставки) успевает доставить k−1, новая — ноль.
 *
 * Поэтому сценарий во всех тестах ниже — «сторож отвечает один раз и отказывает
 * на втором», а утверждение — о ЧИСЛЕ ДОСТАВОК и о снятии сторожа прогона, а не
 * о факте броска.
 *
 * @probe   A (slot-freed): в `hot-slots/slot-freed.ts` вернуть claim внутрь
 *          цикла доставки (объединить два прохода в один).
 *          наблюдалось: «доставок 1, ожидалось 0 — обрыв на втором подписчике
 *          оставил первого уведомлённым» → красный.
 *
 *          B (weekly-stats): в `master/weekly-stats-job.ts` убрать строку
 *          `if (error instanceof NotificationDedupUnavailableError) throw error;`.
 *          наблюдалось: «сторож прогона не снят: cache.del не вызван» → красный.
 *          Это и есть потеря недели: guard стоит с TTL 8 суток, а почасовой
 *          ретрай понедельника упирается в него.
 *
 *          Обе восстановлены, `diff` с бэкапом пуст, зелено.
 */

const claimLock = vi.hoisted(() => vi.fn());
// Параметр объявлен намеренно: без него `mock.calls` типизируется как `[][]`,
// и утверждение о СНЯТОМ КЛЮЧЕ (то есть о пути, а не о результате) не собирается.
const cacheDel = vi.hoisted(() => vi.fn(async (_key: string) => {}));
const deliverNotification = vi.hoisted(() => vi.fn(async () => {}));
const prismaMock = vi.hoisted(() => ({
  hotSlotSubscription: { findMany: vi.fn() },
  provider: { findMany: vi.fn() },
  booking: { findMany: vi.fn(async () => [] as unknown[]) },
}));

vi.mock("@/lib/cache/cache", () => ({ claimLock, del: cacheDel }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification }));
vi.mock("@/lib/telegram/config", () => ({ getAppPublicUrl: () => "https://example.test" }));
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));

const { processSlotFreed } = await import("@/lib/hot-slots/slot-freed");
const { runWeeklyStatsJob } = await import("@/lib/master/weekly-stats-job");
const { NotificationDedupUnavailableError } = await import(
  "@/lib/notifications/dedup-guard"
);

/** Сторож отвечает `n` раз успешно, затем сообщает о недоступности. */
function guardFailsAfter(n: number): void {
  let calls = 0;
  claimLock.mockImplementation(async () => {
    calls += 1;
    return calls <= n
      ? { status: "acquired" }
      : { status: "unavailable", error: new Error("redis silent") };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cacheDel.mockResolvedValue(undefined);
  deliverNotification.mockResolvedValue(undefined);
  prismaMock.booking.findMany.mockResolvedValue([]);
});

describe("FIX-C12 · slot.freed: обрыв в середине не оставляет частичной рассылки", () => {
  const payload = {
    providerId: "prov_1",
    providerName: "Vision",
    providerPublicUsername: "vision",
    slotStartAtUtc: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    slotEndAtUtc: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
    serviceName: "Маникюр",
    timezone: "Europe/Moscow",
    cancelledByUserId: null,
  };

  it("🔴 отказ на ВТОРОМ подписчике → доставок НОЛЬ, а не одна", async () => {
    prismaMock.hotSlotSubscription.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
      { userId: "u3" },
    ]);
    // Первый claim проходит, второй сообщает о недоступности — то есть обрыв
    // случается ПОСЛЕ того, как первый подписчик уже был бы уведомлён.
    guardFailsAfter(1);

    await expect(processSlotFreed(payload as never)).rejects.toBeInstanceOf(
      NotificationDedupUnavailableError,
    );

    expect(
      deliverNotification.mock.calls.length,
      `доставок ${deliverNotification.mock.calls.length}, ожидалось 0 — обрыв на ` +
        "втором подписчике оставил первого уведомлённым: решение «не рассылать» " +
        "принято после того, как часть рассылки состоялась",
    ).toBe(0);
  });

  it("здоровый сторож: рассылка идёт всем, кто заявлен впервые", async () => {
    // Невакуумность: если бы доставок не было и здесь, тест выше ничего не значил.
    prismaMock.hotSlotSubscription.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ]);
    claimLock.mockResolvedValue({ status: "acquired" });

    await processSlotFreed(payload as never);

    expect(deliverNotification.mock.calls.length).toBe(2);
  });

  it("уже уведомлённый (held) пропускается, но рассылку не останавливает", async () => {
    prismaMock.hotSlotSubscription.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ]);
    let calls = 0;
    claimLock.mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? { status: "held" } : { status: "acquired" };
    });

    await processSlotFreed(payload as never);

    // «Занято» — свойство подписчика; «недоступно» — свойство прогона. Разница
    // обязана быть наблюдаемой, иначе ratify-решение не на чем держать.
    expect(deliverNotification.mock.calls.length).toBe(1);
  });
});

describe("FIX-C12 · weekly-stats: обрыв в середине снимает сторож прогона", () => {
  // Прогон идёт только в понедельник UTC — фикстура обязана им быть, иначе
  // функция вернётся на первой строке и тест станет вакуумным.
  const MONDAY = new Date("2026-08-10T09:00:00.000Z");

  it("фикстура действительно понедельник UTC", () => {
    expect(MONDAY.getUTCDay()).toBe(1);
  });

  it("🔴 отказ на втором мастере → runGuardKey СНЯТ (иначе неделя потеряна)", async () => {
    prismaMock.provider.findMany.mockResolvedValue([
      { id: "p1", ownerUserId: "u1" },
      { id: "p2", ownerUserId: "u2" },
    ]);
    // 1-й claim — сторож прогона, 2-й — мастер p1, 3-й — мастер p2 (падает).
    guardFailsAfter(2);

    await runWeeklyStatsJob(MONDAY);

    const deletedKeys = cacheDel.mock.calls.map((call) => call[0]);
    expect(
      deletedKeys,
      "сторож прогона не снят: cache.del не вызван. Значит ключ стоит с TTL 8 " +
        "суток, почасовой ретрай понедельника упирается в него, и недельная " +
        "статистика молча пропущена ДЛЯ ВСЕХ на всю неделю",
    ).toContain("weekly-stats:run:2026-08-10");
  });

  it("ошибка КОНКРЕТНОГО мастера сторож прогона не снимает", async () => {
    // Контроль направления: проброс обязан различать классы, иначе любая
    // ошибка БД у одного мастера отменяла бы прогон для остальных.
    prismaMock.provider.findMany.mockResolvedValue([
      { id: "p1", ownerUserId: "u1" },
      { id: "p2", ownerUserId: "u2" },
    ]);
    claimLock.mockResolvedValue({ status: "acquired" });
    prismaMock.booking.findMany.mockRejectedValue(new Error("db hiccup"));

    await runWeeklyStatsJob(MONDAY);

    const deletedKeys = cacheDel.mock.calls.map((call) => call[0]);
    expect(deletedKeys).not.toContain("weekly-stats:run:2026-08-10");
  });
});

/**
 * Ратификация fail-closed держится на ОДНОМ факте — оба потребителя ретраятся.
 * Если ретрай исчезнет, размен перестанет быть односторонним, а комментарий в
 * `dedup-guard.ts` останется утверждать обратное. Поэтому факт пиннится.
 */
describe("FIX-C12 · ратификация fail-closed опирается на ретрай — он проверяется", () => {
  it("slot.freed ретраится воркером и уходит в dead-letter, а не теряется", () => {
    const worker = readFileSync(resolve(process.cwd(), "src/worker.ts"), "utf8");
    expect(worker).toContain("WORKER_RETRY_MAX_ATTEMPTS");
    expect(worker).toContain("moveToDeadQueue");
    // Обработчик slot.freed обязан идти общим путём `processJob`, у которого
    // и живёт ретрай: собственный try/catch внутри обработчика его отменил бы.
    expect(worker).toMatch(/SLOT_FREED_JOB_TYPE\)\s*\{\s*await processSlotFreedJob\(job\)/);
  });

  it("weekly-stats перезапускается ежечасно (≈24 попытки за понедельник)", () => {
    const worker = readFileSync(resolve(process.cwd(), "src/worker.ts"), "utf8");
    expect(worker).toMatch(/runWeeklyStatsJob\(\)[\s\S]{0,400}?\}, 60 \* 60 \* 1000\)/);
  });
});

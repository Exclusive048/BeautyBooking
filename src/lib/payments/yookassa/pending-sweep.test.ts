import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const processPayload = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { billingPayment: { findMany, findUnique } },
}));
vi.mock("@/lib/payments/yookassa/webhook-processor", () => ({
  processYookassaWebhookPayload: processPayload,
}));
vi.mock("@/lib/logging/logger", () => ({ logError, logInfo: vi.fn() }));

import {
  PENDING_SWEEP_MAX_AGE_MS,
  PENDING_SWEEP_MAX_PAGES,
  PENDING_SWEEP_MIN_AGE_MS,
  PENDING_SWEEP_PAGE_SIZE,
  sweepPendingYookassaPayments,
} from "./pending-sweep";

const NOW = new Date("2026-10-30T12:00:00Z");

function row(n: number) {
  return {
    id: `pay-${n}`,
    createdAt: new Date(NOW.getTime() - 60 * 60 * 1000 + n * 1000),
    yookassaPaymentId: `yk-${n}`,
  };
}

/** Статус строки после обработки — по id платежа в ЮКассе. */
function outcomes(map: Record<string, string>) {
  findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    status: map[where.id] ?? "PENDING",
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  processPayload.mockResolvedValue(undefined);
  outcomes({});
});

/**
 * YOOKASSA-PENDING-SWEEP (A-02).
 *
 * @probe Поменял событие на `payment.canceled` — краснеет «перечитывает каждый
 * платёж…»: «expected [ { …(2) }, … ] to deeply equal [ { …(2) }, … ]». Убрал
 * условие `yookassaPaymentId: { not: null }` — краснеет «окно…»: «expected
 * { status: 'PENDING', …(1) } to deeply equal { status: 'PENDING', …(2) }».
 * Заменил `break` после трёх отказов подряд на `continue` — краснеет «три
 * отказа подряд…»: «expected "vi.fn()" to be called 3 times, but got 5 times».
 */
describe("YOOKASSA-PENDING-SWEEP", () => {
  it("окно: PENDING с id ЮКассы, от 15 минут до 7 суток, старшие первыми", async () => {
    await sweepPendingYookassaPayments(NOW);

    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      status: "PENDING",
      yookassaPaymentId: { not: null },
      createdAt: {
        gte: new Date(NOW.getTime() - PENDING_SWEEP_MAX_AGE_MS),
        lt: new Date(NOW.getTime() - PENDING_SWEEP_MIN_AGE_MS),
      },
    });
    expect(PENDING_SWEEP_MIN_AGE_MS).toBe(15 * 60 * 1000);
    expect(PENDING_SWEEP_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(query.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(query.take).toBe(PENDING_SWEEP_PAGE_SIZE);
  });

  it("перечитывает каждый платёж путём вебхука и считает исходы", async () => {
    findMany.mockResolvedValueOnce([row(1), row(2), row(3)]);
    outcomes({ "pay-1": "SUCCEEDED", "pay-2": "CANCELED", "pay-3": "PENDING" });

    const summary = await sweepPendingYookassaPayments(NOW);

    expect(processPayload.mock.calls.map((c) => c[0])).toEqual([
      { event: "payment.succeeded", objectId: "yk-1" },
      { event: "payment.succeeded", objectId: "yk-2" },
      { event: "payment.succeeded", objectId: "yk-3" },
    ]);
    expect(summary).toEqual({
      checked: 3,
      succeeded: 1,
      canceled: 1,
      stillPending: 1,
      failed: 0,
      stopped: false,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("отказ на одном платеже не останавливает проход; лог без алерта", async () => {
    findMany.mockResolvedValueOnce([row(1), row(2), row(3)]);
    processPayload.mockImplementation(async ({ objectId }: { objectId: string }) => {
      if (objectId === "yk-2") throw new Error("YooKassa GET 503");
    });
    outcomes({ "pay-1": "SUCCEEDED", "pay-3": "SUCCEEDED" });

    const summary = await sweepPendingYookassaPayments(NOW);

    expect(processPayload).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ checked: 2, succeeded: 2, failed: 1, stopped: false });
    expect(logError).toHaveBeenCalledWith(
      "billing.yookassa.pendingSweep.failures",
      expect.objectContaining({ failed: 1, lastError: "YooKassa GET 503", __skipAlert: true }),
    );
  });

  it("три отказа подряд — зависимость лежит, проход останавливается", async () => {
    findMany.mockResolvedValueOnce([row(1), row(2), row(3), row(4), row(5)]);
    processPayload.mockRejectedValue(new Error("timeout"));

    const summary = await sweepPendingYookassaPayments(NOW);

    expect(processPayload).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ checked: 0, failed: 3, stopped: true });
  });

  it("полная страница — следующая по ключу (createdAt, id), неполная — конец", async () => {
    const firstPage = Array.from({ length: PENDING_SWEEP_PAGE_SIZE }, (_, i) => row(i));
    findMany.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([row(500)]);

    await sweepPendingYookassaPayments(NOW);

    expect(findMany).toHaveBeenCalledTimes(2);
    const last = firstPage[firstPage.length - 1];
    expect(findMany.mock.calls[1][0].where.OR).toEqual([
      { createdAt: { gt: last.createdAt } },
      { createdAt: last.createdAt, id: { gt: last.id } },
    ]);
    expect(processPayload).toHaveBeenCalledTimes(PENDING_SWEEP_PAGE_SIZE + 1);
  });

  it("проход конечен: не больше потолка страниц", async () => {
    let n = 0;
    findMany.mockImplementation(async () =>
      Array.from({ length: PENDING_SWEEP_PAGE_SIZE }, () => row((n += 1))),
    );

    await sweepPendingYookassaPayments(NOW);

    expect(findMany).toHaveBeenCalledTimes(PENDING_SWEEP_MAX_PAGES);
  });
});

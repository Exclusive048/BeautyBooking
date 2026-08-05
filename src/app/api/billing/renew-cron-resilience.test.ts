import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * LOGIC-07 — прогон продлений переживает и пересечение с самим собой, и одну
 * сбойную подписку.
 *
 * Было: единственной защитой роута был статический bearer-токен, который
 * аутентифицирует вызывающего, но не мешает двум одновременным вызовам; а тело
 * цикла (от «нет способа оплаты» до `billingPayment.create`) не имело ни
 * собственного try/catch, ни внешнего. Любое исключение — P2002 от гонки,
 * обрыв БД на одной подписке — выбрасывалось из цикла и заканчивало ВЕСЬ
 * прогон: оставшиеся кандидаты в этот день не продлевались, а фазы после цикла
 * (trial-cron, price-optin-cron) не запускались вовсе. Наружу это выглядело как
 * 500 без единого признака того, кто успел обработаться.
 *
 * Тест держит четыре свойства:
 *   1) занятый лок → 409 и ни одного чтения БД (дубли аудита/уведомлений фазы 1);
 *   2) недоступный Redis → прогон ИДЁТ (fail-open: двойное списание держит
 *      `idempotenceKey @unique`, а не этот лок) и чужой лок не снимается;
 *   3) сбойная подписка стоит одной строки, а не дня — остальные обработаны,
 *      обе финальные фазы запущены, в ответе честная сводка;
 *   4) P2002 на `create` читается как «взял другой прогон» — без второго
 *      обращения в YooKassa и без счёта в failed.
 */

type Sub = {
  id: string;
  userId: string;
  scope: string;
  planId: string;
  periodMonths: number;
  paymentMethodId: string | null;
  plan: { code: string; name: string };
};

const state = vi.hoisted(() => ({
  setNxResult: true as boolean,
  setNxThrows: false,
  candidates: [] as unknown[],
  subUpdateThrowsFor: null as string | null,
  paymentCreateThrows: null as "P2002" | "OTHER" | null,
  phaseOneThrows: false,
}));

const spies = vi.hoisted(() => ({
  setNx: vi.fn(),
  del: vi.fn(),
  subFindMany: vi.fn(),
  subUpdate: vi.fn(),
  paymentCreate: vi.fn(),
  createRecurringPayment: vi.fn(),
  processTrialExpirations: vi.fn(),
  processPriceOptInReminders: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/cache/cache", () => ({
  setNx: async (...args: unknown[]) => {
    spies.setNx(...args);
    if (state.setNxThrows) throw new Error("redis down");
    return state.setNxResult;
  },
  del: async (...args: unknown[]) => {
    spies.del(...args);
  },
}));

vi.mock("@/lib/env", () => ({
  env: { BILLING_RENEW_SECRET: "cron-secret" },
  isProduction: false,
}));

vi.mock("@/lib/api/cron-auth", () => ({ isAuthorizedCronRequest: () => true }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSubscription: {
      // Фазы 1-2 (истёкшие / отменяемые) в этом тесте пусты: предмет — цикл
      // продлений, третий вызов отдаёт кандидатов.
      findMany: async (...args: unknown[]) => {
        spies.subFindMany(...args);
        const call = spies.subFindMany.mock.calls.length;
        if (call === 1 && state.phaseOneThrows) throw new Error("phase 1 down");
        return call === 3 ? state.candidates : [];
      },
      updateMany: async () => ({ count: 0 }),
      update: async (args: { where: { id: string } }) => {
        spies.subUpdate(args);
        if (state.subUpdateThrowsFor === args.where.id) {
          throw new Error("db connection lost");
        }
        return {};
      },
    },
    billingAuditLog: { createMany: async () => ({ count: 0 }) },
    billingPlanPrice: {
      findMany: async () => [{ periodMonths: 1, priceKopeks: 100_000 }],
    },
    billingPayment: {
      // Никаких прошлых успешных платежей → ветка price-opt-in не срабатывает.
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      update: async () => ({}),
      create: async (...args: unknown[]) => {
        spies.paymentCreate(...args);
        if (state.paymentCreateThrows === "P2002") {
          throw new Prisma.PrismaClientKnownRequestError("unique", {
            code: "P2002",
            clientVersion: "6.19.3",
          });
        }
        if (state.paymentCreateThrows === "OTHER") throw new Error("db down");
        return { id: "pay-1" };
      },
    },
  },
}));

vi.mock("@/lib/payments/yookassa/client", () => ({
  createRecurringPayment: async (...args: unknown[]) => {
    spies.createRecurringPayment(...args);
    return { status: "succeeded" as const, paymentId: "yk-1" };
  },
}));

vi.mock("@/lib/billing/audit", () => ({ createBillingAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/notifications", () => ({ createBillingNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/get-current-plan", () => ({ invalidatePlanCache: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/trial-cron", () => ({
  processTrialExpirations: async () => {
    spies.processTrialExpirations();
    return { warned: 0, warnErrors: 0, downgraded: 0, downgradeErrors: 0 };
  },
}));
vi.mock("@/lib/billing/price-optin-cron", () => ({
  processPriceOptInReminders: async () => {
    spies.processPriceOptInReminders();
    return { sent24h: 0, sent2h: 0, errors: 0 };
  },
}));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: spies.logError,
}));

import { POST } from "@/app/api/billing/renew/run/route";

function sub(id: string, paymentMethodId: string | null = null): Sub {
  return {
    id,
    userId: `user-${id}`,
    scope: "MASTER",
    planId: "plan-1",
    periodMonths: 1,
    paymentMethodId,
    plan: { code: "PRO", name: "PRO" },
  };
}

function call(): Promise<Response> {
  return POST(
    new Request("http://localhost/api/billing/renew/run", {
      method: "POST",
      headers: { "x-cron-token": "cron-secret" },
    }),
  );
}

beforeEach(() => {
  state.setNxResult = true;
  state.setNxThrows = false;
  state.candidates = [];
  state.subUpdateThrowsFor = null;
  state.paymentCreateThrows = null;
  state.phaseOneThrows = false;
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe("LOGIC-07 · лок прогона", () => {
  it("занятый лок → 409 и ни одного чтения БД", async () => {
    state.setNxResult = false;

    const res = await call();

    expect(res.status).toBe(409);
    // Фаза 1 не должна была даже прочитать набор: именно её `createMany`
    // аудита и цикл уведомлений дублировались при пересечении прогонов.
    expect(spies.subFindMany).not.toHaveBeenCalled();
    // Чужой лок снимать нельзя — иначе третий прогон войдёт следом.
    expect(spies.del).not.toHaveBeenCalled();
  });

  it("свободный лок → прогон идёт и лок снимается в конце", async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(spies.setNx).toHaveBeenCalledWith("billing:renew:run", expect.any(String), 30 * 60);
    expect(spies.del).toHaveBeenCalledWith("billing:renew:run");
  });

  it("Redis недоступен → прогон ИДЁТ (fail-open) и лок не снимается", async () => {
    state.setNxThrows = true;
    state.candidates = [sub("s1")];

    const res = await call();

    expect(res.status).toBe(200);
    // Лока мы не брали — значит и удалять нечего (иначе сняли бы чужой).
    expect(spies.del).not.toHaveBeenCalled();
    expect(spies.subUpdate).toHaveBeenCalled();
  });
});

describe("LOGIC-07 · сбойная подписка не убивает батч", () => {
  it("исключение на одной подписке стоит одной строки, а не дня", async () => {
    state.candidates = [sub("s1"), sub("s2"), sub("s3")];
    state.subUpdateThrowsFor = "s2";

    const res = await call();
    const body = (await res.json()) as { data: { renewals: Record<string, number> } };

    expect(res.status).toBe(200);
    expect(body.data.renewals).toEqual({ candidates: 3, processed: 2, failed: 1, renewed: 0 });
    // Соседи по батчу обработаны, несмотря на падение s2.
    expect(spies.subUpdate.mock.calls.map((c) => c[0].where.id)).toEqual(["s1", "s2", "s3"]);
    // И фазы ПОСЛЕ цикла запустились — раньше исключение хоронило и их.
    expect(spies.processTrialExpirations).toHaveBeenCalledTimes(1);
    expect(spies.processPriceOptInReminders).toHaveBeenCalledTimes(1);
    expect(spies.logError).toHaveBeenCalled();
  });

  it("исключение ВНЕ цикла (фаза 1) всё равно снимает лок", async () => {
    // Такое исключение изоляции по элементу не подлежит — прогон честно падает.
    // Но лок обязан сняться, иначе следующий запуск упрётся в 409 до истечения
    // TTL, то есть один сбой БД стоил бы получаса тишины в биллинге.
    state.phaseOneThrows = true;

    await expect(call()).rejects.toThrow("phase 1 down");
    expect(spies.del).toHaveBeenCalledWith("billing:renew:run");
  });
});

describe("LOGIC-07 · P2002 на создании платежа", () => {
  it("читается как «взял другой прогон»: без обращения в YooKassa и без failed", async () => {
    state.candidates = [sub("s1", "pm-1"), sub("s2", "pm-2")];
    state.paymentCreateThrows = "P2002";

    const res = await call();
    const body = (await res.json()) as { data: { renewals: Record<string, number> } };

    expect(res.status).toBe(200);
    expect(spies.paymentCreate).toHaveBeenCalledTimes(2);
    // Ключевое: проигравший гонку НЕ доходит до списания.
    expect(spies.createRecurringPayment).not.toHaveBeenCalled();
    expect(body.data.renewals).toEqual({ candidates: 2, processed: 2, failed: 0, renewed: 0 });
  });

  it("не-P2002 на создании платежа остаётся ошибкой элемента", async () => {
    state.candidates = [sub("s1", "pm-1")];
    state.paymentCreateThrows = "OTHER";

    const res = await call();
    const body = (await res.json()) as { data: { renewals: Record<string, number> } };

    expect(body.data.renewals).toEqual({ candidates: 1, processed: 0, failed: 1, renewed: 0 });
    expect(spies.createRecurringPayment).not.toHaveBeenCalled();
  });
});

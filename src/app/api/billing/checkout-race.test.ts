import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * LOGIC-08 — двойной клик по «Оплатить» отвечает `{ reused: true }`, а не 500.
 *
 * Два последовательных guard'а (30-минутный `recentPending` и `findUnique` по
 * `idempotenceKey`) закрывали ОБЫЧНЫЙ последовательный дубль. Но при истинно
 * одновременных запросах оба читают пустоту и оба доходят до
 * `billingPayment.create`, который не был обёрнут ни во что: проигравший
 * получал P2002 от `idempotenceKey @unique` наружу необработанным. Двух
 * платежей в ЮКассе при этом не возникало (констрейнт срабатывает ДО вызова
 * API — это и есть работающая денежная гарантия, инв. #4), но пользователь на
 * платёжном экране видел сырой 500 — худшее место для необъяснимой ошибки.
 *
 * Тест держит три свойства: проигравший гонки получает ту же ветку ответа, что
 * и последовательный дубль; в ЮКассу при этом никто не ходит; чужой P2002 и
 * прочие ошибки по-прежнему не проглатываются.
 */

const state = vi.hoisted(() => ({
  createThrows: null as "P2002" | "OTHER" | null,
  // Что вернёт повторное чтение по ключу после конфликта.
  winner: null as { status: string; confirmationUrl: string | null } | null,
  existingByKey: null as { status: string; confirmationUrl: string | null } | null,
  // LAUNCH-PROMO-01: сценарии оплаты — после акции; сама акция — отдельный тест.
  promoActive: false,
}));

const spies = vi.hoisted(() => ({
  paymentCreate: vi.fn(),
  paymentFindUnique: vi.fn(),
  createInitialPayment: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => ({ id: "user-1", roles: ["MASTER"] }),
}));

vi.mock("@/lib/master/access", () => ({
  isCurrentMasterManagedByStudio: async () => false,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billingPlan: {
      findUnique: async () => ({
        id: "plan-1",
        code: "PRO",
        name: "PRO",
        tier: "PRO",
        scope: "MASTER",
        isActive: true,
        prices: [{ periodMonths: 1, priceKopeks: 100_000 }],
      }),
    },
    userSubscription: {
      findUnique: async () => ({ id: "sub-1", status: "ACTIVE", planId: "plan-1" }),
      create: async () => ({ id: "sub-1" }),
      update: async () => ({}),
      upsert: async () => ({ id: "sub-1" }),
    },
    billingPayment: {
      // Первый вызов — guard `recentPending` (findFirst), он пуст.
      findFirst: async () => null,
      findUnique: async (...args: unknown[]) => {
        spies.paymentFindUnique(...args);
        // Первое чтение — guard до создания; второе — re-read после конфликта.
        return spies.paymentFindUnique.mock.calls.length === 1
          ? state.existingByKey
          : state.winner;
      },
      create: async (...args: unknown[]) => {
        spies.paymentCreate(...args);
        if (state.createThrows === "P2002") {
          throw new Prisma.PrismaClientKnownRequestError("unique", {
            code: "P2002",
            clientVersion: "6.19.3",
          });
        }
        if (state.createThrows === "OTHER") throw new Error("db down");
        return { id: "pay-1" };
      },
      update: async () => ({}),
    },
  },
}));

vi.mock("@/lib/payments/yookassa/client", () => ({
  createInitialPayment: async (...args: unknown[]) => {
    spies.createInitialPayment(...args);
    return { paymentId: "yk-1", confirmationUrl: "https://yookassa.test/pay/yk-1" };
  },
}));

vi.mock("@/lib/billing/launch-promo", () => ({ isLaunchPromoActive: () => state.promoActive }));
vi.mock("@/lib/billing/audit", () => ({ createBillingAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/get-current-plan", () => ({ invalidatePlanCache: vi.fn(async () => {}) }));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import { POST } from "@/app/api/billing/checkout/route";

function call(): Promise<Response> {
  return POST(
    new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "MASTER",
        planId: "plan-1",
        periodMonths: 1,
        returnUrl: "https://app.test/return",
      }),
    }),
  );
}

beforeEach(() => {
  state.createThrows = null;
  state.winner = null;
  state.existingByKey = null;
  state.promoActive = false;
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe("LOGIC-08 · проигравший гонку получает reused, а не 500", () => {
  it("P2002 + победитель уже со ссылкой → та же ссылка и reused", async () => {
    state.createThrows = "P2002";
    state.winner = { status: "PENDING", confirmationUrl: "https://yookassa.test/pay/yk-1" };

    const res = await call();
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      confirmationUrl: "https://yookassa.test/pay/yk-1",
      reused: true,
    });
    // Ключевое: второй платёж в ЮКассе не заводится.
    expect(spies.createInitialPayment).not.toHaveBeenCalled();
  });

  it("P2002 + победитель ещё не сходил в ЮКассу → mode: pending, не 500", async () => {
    state.createThrows = "P2002";
    state.winner = { status: "PENDING", confirmationUrl: null };

    const res = await call();
    const body = (await res.json()) as { data: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ mode: "pending", reused: true });
  });

  it("P2002 + платёж уже прошёл → already-paid", async () => {
    state.createThrows = "P2002";
    state.winner = { status: "SUCCEEDED", confirmationUrl: null };

    const res = await call();
    const body = (await res.json()) as { data: Record<string, unknown> };

    expect(body.data).toEqual({ mode: "already-paid", reused: true });
  });

  it("P2002 + терминальный статус → 409, тот же код, что у последовательного дубля", async () => {
    state.createThrows = "P2002";
    state.winner = { status: "FAILED", confirmationUrl: null };

    const res = await call();
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("PAYMENT_ALREADY_EXISTS");
  });

  it("ветки последовательного дубля не изменились (одна лестница на два места)", async () => {
    state.existingByKey = { status: "PENDING", confirmationUrl: "https://yookassa.test/pay/yk-0" };

    const res = await call();
    const body = (await res.json()) as { data: Record<string, unknown> };

    expect(body.data).toEqual({
      confirmationUrl: "https://yookassa.test/pay/yk-0",
      reused: true,
    });
    expect(spies.paymentCreate).not.toHaveBeenCalled();
  });
});

describe("LOGIC-08 · молчать о чужих ошибках нельзя", () => {
  it("не-P2002 на создании платежа не проглатывается", async () => {
    state.createThrows = "OTHER";
    await expect(call()).rejects.toThrow("db down");
  });

  it("P2002 без строки по ключу (конфликт по другому констрейнту) пробрасывается", async () => {
    state.createThrows = "P2002";
    state.winner = null;
    await expect(call()).rejects.toThrow();
  });
});

describe("LAUNCH-PROMO-01 · до 1 ноября платный тариф не продаётся", () => {
  it("платный checkout во время акции → 409 LAUNCH_PROMO_ACTIVE, ни платежа, ни ЮКассы", async () => {
    state.promoActive = true;

    const res = await call();
    const body = (await res.json()) as { ok: boolean; error: { code: string; message: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("LAUNCH_PROMO_ACTIVE");
    expect(spies.paymentCreate).not.toHaveBeenCalled();
    expect(spies.createInitialPayment).not.toHaveBeenCalled();
  });
});

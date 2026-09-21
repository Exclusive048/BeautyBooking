import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  LAUNCH_PROMO_ENDS_AT,
  TRIAL_DURATION_DAYS,
  isLaunchPromoActive,
  resolveTrialEndsAt,
} from "@/lib/billing/launch-promo";
import { backfillLaunchPromo, grantLaunchPromoInTx } from "@/lib/billing/launch-promo-grant";

const BEFORE = new Date("2026-09-22T12:00:00Z");
const AFTER = new Date("2026-11-02T12:00:00Z");

describe("launch-promo — граница акции", () => {
  it("конец акции — полночь 1 ноября по Москве", () => {
    expect(LAUNCH_PROMO_ENDS_AT.toISOString()).toBe("2026-10-31T21:00:00.000Z");
  });

  it("активна строго до полуночи 1 ноября МСК", () => {
    expect(isLaunchPromoActive(new Date("2026-10-31T20:59:59.999Z"))).toBe(true);
    expect(isLaunchPromoActive(new Date("2026-10-31T21:00:00.000Z"))).toBe(false);
  });

  it("регистрация во время акции — PREMIUM до её конца, после — обычные 30 дней", () => {
    expect(resolveTrialEndsAt(BEFORE).toISOString()).toBe(LAUNCH_PROMO_ENDS_AT.toISOString());
    expect(resolveTrialEndsAt(AFTER).getTime()).toBe(AFTER.getTime() + TRIAL_DURATION_DAYS * 86_400_000);
  });
});

const subFindUnique = vi.fn();
const subCreate = vi.fn();
const subUpdate = vi.fn();
const planFindUnique = vi.fn();
const planFindFirst = vi.fn();
const auditCreate = vi.fn();

const tx = {
  userSubscription: { findUnique: subFindUnique, create: subCreate, update: subUpdate },
  billingPlan: { findUnique: planFindUnique, findFirst: planFindFirst },
  billingAuditLog: { create: auditCreate },
} as unknown as Prisma.TransactionClient;

const PREMIUM = { id: "plan-premium", code: "MASTER_PREMIUM", isActive: true };

beforeEach(() => {
  for (const fn of [subFindUnique, subCreate, subUpdate, planFindUnique, planFindFirst, auditCreate]) fn.mockReset();
  planFindUnique.mockResolvedValue(PREMIUM);
  subCreate.mockResolvedValue({ id: "sub-new" });
});

function row(overrides: Record<string, unknown>) {
  return {
    id: "sub-1",
    planId: "plan-free",
    status: "ACTIVE",
    isTrial: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    graceUntil: null,
    plan: { tier: "FREE" },
    ...overrides,
  };
}

describe("grantLaunchPromoInTx", () => {
  it("нет подписки → создаёт PREMIUM-trial до конца акции + аудит", async () => {
    subFindUnique.mockResolvedValue(null);
    const result = await grantLaunchPromoInTx(tx, { userId: "u1", scope: "MASTER", now: BEFORE, source: "test" });
    expect(result.outcome).toBe("created");
    const data = subCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ planId: "plan-premium", isTrial: true, status: "ACTIVE", autoRenew: false });
    expect(data.trialEndsAt.toISOString()).toBe(LAUNCH_PROMO_ENDS_AT.toISOString());
    expect(data.currentPeriodEnd.toISOString()).toBe(LAUNCH_PROMO_ENDS_AT.toISOString());
    expect(auditCreate.mock.calls[0][0].data.action).toBe("LAUNCH_PROMO_GRANTED");
  });

  it("FREE-строка (зарегистрирован до акции) → переводится на PREMIUM на месте, без второй строки", async () => {
    subFindUnique.mockResolvedValue(row({}));
    const result = await grantLaunchPromoInTx(tx, { userId: "u1", scope: "MASTER", now: BEFORE, source: "test" });
    expect(result.outcome).toBe("upgraded");
    expect(subCreate).not.toHaveBeenCalled();
    expect(subUpdate.mock.calls[0][0]).toMatchObject({ where: { id: "sub-1" }, data: { planId: "plan-premium", isTrial: true } });
  });

  it("30-дневный trial, кончающийся раньше акции → продлевается до конца акции", async () => {
    subFindUnique.mockResolvedValue(
      row({ isTrial: true, plan: { tier: "PREMIUM" }, planId: "plan-premium", trialEndsAt: new Date("2026-10-10T00:00:00Z") }),
    );
    const result = await grantLaunchPromoInTx(tx, { userId: "u1", scope: "MASTER", now: BEFORE, source: "test" });
    expect(result.outcome).toBe("upgraded");
  });

  it("уже на акции → ничего не пишет (идемпотентно для деплоя)", async () => {
    subFindUnique.mockResolvedValue(
      row({ isTrial: true, plan: { tier: "PREMIUM" }, trialEndsAt: new Date(LAUNCH_PROMO_ENDS_AT.getTime()) }),
    );
    const result = await grantLaunchPromoInTx(tx, { userId: "u1", scope: "MASTER", now: BEFORE, source: "test" });
    expect(result.outcome).toBe("skipped-already");
    expect(subUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("оплаченная живая подписка — не трогается никогда", async () => {
    subFindUnique.mockResolvedValue(
      row({ plan: { tier: "PRO" }, currentPeriodEnd: new Date("2026-12-01T00:00:00Z") }),
    );
    const result = await grantLaunchPromoInTx(tx, { userId: "u1", scope: "MASTER", now: BEFORE, source: "test" });
    expect(result.outcome).toBe("skipped-paid");
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it("после 1 ноября — no-op", async () => {
    const result = await grantLaunchPromoInTx(tx, { userId: "u1", scope: "MASTER", now: AFTER, source: "test" });
    expect(result.outcome).toBe("skipped-promo-over");
    expect(subFindUnique).not.toHaveBeenCalled();
  });

  it("нет PREMIUM-плана → пропуск без записи", async () => {
    subFindUnique.mockResolvedValue(null);
    planFindUnique.mockResolvedValue(null);
    planFindFirst.mockResolvedValue(null);
    const result = await grantLaunchPromoInTx(tx, { userId: "u1", scope: "STUDIO", now: BEFORE, source: "test" });
    expect(result.outcome).toBe("skipped-no-plan");
    expect(subCreate).not.toHaveBeenCalled();
  });
});

describe("backfillLaunchPromo", () => {
  it("идёт по ролям: мастер → MASTER, студия/админ студии → STUDIO; сбой строки не валит остальные", async () => {
    subFindUnique.mockResolvedValue(null);
    const findMany = vi.fn().mockResolvedValue([
      { id: "m", roles: ["CLIENT", "MASTER"] },
      { id: "s", roles: ["STUDIO"] },
      { id: "both", roles: ["MASTER", "STUDIO_ADMIN"] },
    ]);
    let call = 0;
    const client = {
      userProfile: { findMany },
      $transaction: vi.fn(async (fn: (t: Prisma.TransactionClient) => unknown) => {
        call += 1;
        if (call === 2) throw new Error("boom");
        return fn(tx);
      }),
    };
    const summary = await backfillLaunchPromo(client as never, BEFORE);
    expect(findMany.mock.calls[0][0].where.isDeleted).toBe(false);
    expect(summary.created).toBe(3);
    expect(summary.failed).toEqual([{ userId: "s", scope: "STUDIO", message: "boom" }]);
  });

  it("после акции не читает БД вовсе", async () => {
    const findMany = vi.fn();
    const summary = await backfillLaunchPromo({ userProfile: { findMany }, $transaction: vi.fn() } as never, AFTER);
    expect(findMany).not.toHaveBeenCalled();
    expect(summary.created + summary.upgraded).toBe(0);
  });
});

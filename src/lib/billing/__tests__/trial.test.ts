import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mocks so vi.mock factories can reference them.
const subFindUnique = vi.hoisted(() => vi.fn());
const subFindFirst = vi.hoisted(() => vi.fn());
const subFindMany = vi.hoisted(() => vi.fn());
const subCreate = vi.hoisted(() => vi.fn());
const subUpdate = vi.hoisted(() => vi.fn());
const planFindFirst = vi.hoisted(() => vi.fn());
const auditCreate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const ensureFreeSubscription = vi.hoisted(() => vi.fn());
const invalidatePlanCache = vi.hoisted(() => vi.fn());
const sendTrialEndingSoon = vi.hoisted(() => vi.fn());
const sendTrialExpired = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

const txClient = {
  userSubscription: {
    findUnique: subFindUnique,
    findFirst: subFindFirst,
    findMany: subFindMany,
    create: subCreate,
    update: subUpdate,
  },
  billingPlan: {
    findFirst: planFindFirst,
  },
  billingAuditLog: {
    create: auditCreate,
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    userSubscription: {
      findUnique: subFindUnique,
      findFirst: subFindFirst,
      findMany: subFindMany,
      create: subCreate,
      update: subUpdate,
    },
    billingPlan: { findFirst: planFindFirst },
    billingAuditLog: { create: auditCreate },
  },
}));

vi.mock("@/lib/logging/logger", () => ({
  logInfo,
  logError,
}));

vi.mock("@/lib/billing/ensure-free-subscription", () => ({
  ensureFreeSubscription,
}));

vi.mock("@/lib/billing/get-current-plan", () => ({
  invalidatePlanCache,
}));

vi.mock("@/lib/billing/notifications-trial", () => ({
  sendTrialEndingSoonNotification: sendTrialEndingSoon,
  sendTrialExpiredNotification: sendTrialExpired,
}));

import {
  TRIAL_DURATION_DAYS,
  activateTrialForNewProvider,
  ensureFreeOrTrialSubscription,
} from "@/lib/billing/trial";
import { processTrialExpirations } from "@/lib/billing/trial-cron";

beforeEach(() => {
  subFindUnique.mockReset();
  subFindFirst.mockReset();
  subFindMany.mockReset();
  subCreate.mockReset();
  subUpdate.mockReset();
  planFindFirst.mockReset();
  auditCreate.mockReset();
  transaction.mockReset();
  ensureFreeSubscription.mockReset();
  invalidatePlanCache.mockReset();
  sendTrialEndingSoon.mockReset();
  sendTrialExpired.mockReset();
  logInfo.mockReset();
  logError.mockReset();

  // Default: $transaction(callback) → callback(txClient)
  transaction.mockImplementation(async (callback: (tx: typeof txClient) => unknown) => callback(txClient));
});

describe("activateTrialForNewProvider", () => {
  it("creates trial subscription with PREMIUM plan and 30-day expiry", async () => {
    subFindUnique.mockResolvedValueOnce(null); // no existing
    subFindFirst.mockResolvedValueOnce(null); // never had premium
    planFindFirst.mockResolvedValueOnce({ id: "plan-premium", code: "MASTER_PREMIUM" });
    subCreate.mockResolvedValueOnce({ id: "sub-1" });
    auditCreate.mockResolvedValueOnce({});

    const before = Date.now();
    const result = await activateTrialForNewProvider("user-1", "MASTER");
    const after = Date.now();

    expect(result).toEqual({
      ok: true,
      subscriptionId: "sub-1",
      trialEndsAt: expect.any(Date),
    });
    if (result.ok) {
      const expectedMin = before + TRIAL_DURATION_DAYS * 86_400_000;
      const expectedMax = after + TRIAL_DURATION_DAYS * 86_400_000;
      expect(result.trialEndsAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.trialEndsAt.getTime()).toBeLessThanOrEqual(expectedMax);
    }

    expect(subCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          scope: "MASTER",
          planId: "plan-premium",
          isTrial: true,
          autoRenew: false,
          status: "ACTIVE",
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalled();
  });

  it("returns 'already-active' when user already has any subscription on this scope", async () => {
    subFindUnique.mockResolvedValueOnce({ id: "existing", planId: "plan-free", isTrial: false });

    const result = await activateTrialForNewProvider("user-1", "MASTER");

    expect(result).toEqual({ ok: false, reason: "already-active" });
    expect(subCreate).not.toHaveBeenCalled();
    expect(planFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'already-had-premium' when user previously had PREMIUM (cancelled or expired)", async () => {
    subFindUnique.mockResolvedValueOnce(null);
    subFindFirst.mockResolvedValueOnce({ id: "old-premium" }); // was premium before

    const result = await activateTrialForNewProvider("user-1", "MASTER");

    expect(result).toEqual({ ok: false, reason: "already-had-premium" });
    expect(subCreate).not.toHaveBeenCalled();
    expect(planFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'premium-plan-not-found' when PREMIUM plan is not in DB", async () => {
    subFindUnique.mockResolvedValueOnce(null);
    subFindFirst.mockResolvedValueOnce(null);
    planFindFirst.mockResolvedValueOnce(null);

    const result = await activateTrialForNewProvider("user-1", "MASTER");

    expect(result).toEqual({ ok: false, reason: "premium-plan-not-found" });
    expect(subCreate).not.toHaveBeenCalled();
  });

  it("activates STUDIO trial independently from MASTER (different unique key)", async () => {
    subFindUnique.mockResolvedValueOnce(null); // no studio sub yet
    subFindFirst.mockResolvedValueOnce(null);
    planFindFirst.mockResolvedValueOnce({ id: "plan-studio-premium", code: "STUDIO_PREMIUM" });
    subCreate.mockResolvedValueOnce({ id: "sub-studio-1" });
    auditCreate.mockResolvedValueOnce({});

    const result = await activateTrialForNewProvider("user-1", "STUDIO");

    expect(result.ok).toBe(true);
    expect(subFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_scope: { userId: "user-1", scope: "STUDIO" } },
      }),
    );
    expect(planFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scope: "STUDIO", tier: "PREMIUM" }),
      }),
    );
  });

  it("eligibility checks run inside a single $transaction (atomic)", async () => {
    subFindUnique.mockResolvedValueOnce(null);
    subFindFirst.mockResolvedValueOnce(null);
    planFindFirst.mockResolvedValueOnce({ id: "plan-premium", code: "MASTER_PREMIUM" });
    subCreate.mockResolvedValueOnce({ id: "sub-1" });
    auditCreate.mockResolvedValueOnce({});

    await activateTrialForNewProvider("user-1", "MASTER");

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("ensureFreeOrTrialSubscription", () => {
  it("returns 'trial' mode and invalidates cache on successful activation", async () => {
    subFindUnique.mockResolvedValueOnce(null);
    subFindFirst.mockResolvedValueOnce(null);
    planFindFirst.mockResolvedValueOnce({ id: "plan-premium", code: "MASTER_PREMIUM" });
    subCreate.mockResolvedValueOnce({ id: "sub-1" });
    auditCreate.mockResolvedValueOnce({});

    const result = await ensureFreeOrTrialSubscription("user-1", "MASTER", "test");

    expect(result.mode).toBe("trial");
    expect(result.subscriptionId).toBe("sub-1");
    expect(invalidatePlanCache).toHaveBeenCalledWith("user-1", "MASTER");
    expect(ensureFreeSubscription).not.toHaveBeenCalled();
  });

  it("returns 'existing' mode without falling back when subscription already exists", async () => {
    subFindUnique.mockResolvedValueOnce({ id: "existing", planId: "plan-free", isTrial: false });

    const result = await ensureFreeOrTrialSubscription("user-1", "MASTER", "test");

    expect(result.mode).toBe("existing");
    expect(ensureFreeSubscription).not.toHaveBeenCalled();
  });

  it("falls back to FREE subscription when activation fails (premium-plan-not-found)", async () => {
    subFindUnique.mockResolvedValueOnce(null);
    subFindFirst.mockResolvedValueOnce(null);
    planFindFirst.mockResolvedValueOnce(null);
    ensureFreeSubscription.mockResolvedValueOnce(undefined);

    const result = await ensureFreeOrTrialSubscription("user-1", "MASTER", "test");

    expect(result.mode).toBe("free-fallback");
    expect(result.fallbackReason).toBe("premium-plan-not-found");
    expect(ensureFreeSubscription).toHaveBeenCalledWith("user-1", "MASTER");
  });

  it("falls back to FREE when activation throws (defensive)", async () => {
    transaction.mockRejectedValueOnce(new Error("DB exploded"));
    ensureFreeSubscription.mockResolvedValueOnce(undefined);

    const result = await ensureFreeOrTrialSubscription("user-1", "MASTER", "test");

    expect(result.mode).toBe("free-fallback");
    expect(ensureFreeSubscription).toHaveBeenCalledWith("user-1", "MASTER");
  });
});

describe("processTrialExpirations", () => {
  const NOW = new Date("2026-05-15T12:00:00Z");

  it("warns trials ending within 3 days and marks notification sent", async () => {
    const expiringSoon = {
      id: "sub-1",
      userId: "user-1",
      scope: "MASTER" as const,
      trialEndsAt: new Date("2026-05-17T12:00:00Z"), // 2 days ahead
    };
    subFindMany
      .mockResolvedValueOnce([expiringSoon]) // warning batch
      .mockResolvedValueOnce([]); // no expired
    sendTrialEndingSoon.mockResolvedValueOnce({});
    subUpdate.mockResolvedValueOnce({});

    const result = await processTrialExpirations(NOW);

    expect(result.warned).toBe(1);
    expect(result.warnErrors).toBe(0);
    expect(sendTrialEndingSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        scope: "MASTER",
        subscriptionId: "sub-1",
        daysLeft: 2,
      }),
    );
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: { trialEndingNotificationSentAt: NOW },
      }),
    );
  });

  it("does not re-warn (query filters by trialEndingNotificationSentAt: null)", async () => {
    subFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await processTrialExpirations(NOW);
    expect(subFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trialEndingNotificationSentAt: null,
        }),
      }),
    );
  });

  it("downgrades expired trials in-place (mutates planId, isTrial, status)", async () => {
    const expired = {
      id: "sub-1",
      userId: "user-1",
      scope: "MASTER" as const,
      planId: "plan-premium",
    };
    subFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([expired]);

    // Inside downgradeTrialToFree's transaction:
    subFindUnique.mockResolvedValueOnce({
      id: "sub-1",
      isTrial: true,
      planId: "plan-premium",
      scope: "MASTER",
      userId: "user-1",
    });
    planFindFirst.mockResolvedValueOnce({ id: "plan-free", code: "MASTER_FREE" });
    subUpdate.mockResolvedValueOnce({});
    auditCreate.mockResolvedValueOnce({});
    sendTrialExpired.mockResolvedValueOnce({});

    const result = await processTrialExpirations(NOW);

    expect(result.downgraded).toBe(1);
    expect(result.downgradeErrors).toBe(0);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({
          planId: "plan-free",
          isTrial: false,
          trialEndsAt: null,
          status: "ACTIVE",
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "TRIAL_DOWNGRADED_TO_FREE",
        }),
      }),
    );
    expect(sendTrialExpired).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", subscriptionId: "sub-1" }),
    );
  });

  it("counts downgrade errors when FREE plan is missing for scope", async () => {
    const expired = {
      id: "sub-1",
      userId: "user-1",
      scope: "MASTER" as const,
      planId: "plan-premium",
    };
    subFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([expired]);
    subFindUnique.mockResolvedValueOnce({
      id: "sub-1",
      isTrial: true,
      planId: "plan-premium",
      scope: "MASTER",
      userId: "user-1",
    });
    planFindFirst.mockResolvedValueOnce(null); // FREE not configured

    const result = await processTrialExpirations(NOW);

    expect(result.downgraded).toBe(0);
    expect(result.downgradeErrors).toBe(1);
    expect(logError).toHaveBeenCalledWith(
      "Trial downgrade failed",
      expect.objectContaining({ subscriptionId: "sub-1" }),
    );
  });

  it("processes warning + downgrade independently in the same run", async () => {
    const expiringSoon = {
      id: "sub-warn",
      userId: "user-w",
      scope: "MASTER" as const,
      trialEndsAt: new Date("2026-05-17T12:00:00Z"),
    };
    const expired = {
      id: "sub-done",
      userId: "user-d",
      scope: "STUDIO" as const,
      planId: "plan-studio-premium",
    };
    subFindMany.mockResolvedValueOnce([expiringSoon]).mockResolvedValueOnce([expired]);
    sendTrialEndingSoon.mockResolvedValueOnce({});
    subUpdate.mockResolvedValueOnce({});
    subFindUnique.mockResolvedValueOnce({
      id: "sub-done",
      isTrial: true,
      planId: "plan-studio-premium",
      scope: "STUDIO",
      userId: "user-d",
    });
    planFindFirst.mockResolvedValueOnce({ id: "plan-studio-free", code: "STUDIO_FREE" });
    subUpdate.mockResolvedValueOnce({});
    auditCreate.mockResolvedValueOnce({});
    sendTrialExpired.mockResolvedValueOnce({});

    const result = await processTrialExpirations(NOW);

    expect(result.warned).toBe(1);
    expect(result.downgraded).toBe(1);
  });
});

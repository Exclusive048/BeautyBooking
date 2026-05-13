import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshotFindUnique = vi.hoisted(() => vi.fn());
const snapshotCreate = vi.hoisted(() => vi.fn());
const subFindMany = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mrrSnapshot: {
      findUnique: snapshotFindUnique,
      create: snapshotCreate,
    },
    userSubscription: {
      findMany: subFindMany,
    },
  },
}));

vi.mock("@/lib/logging/logger", () => ({
  logInfo,
}));

import {
  createMrrSnapshotForToday,
  getMrrSnapshotDaysAgo,
} from "@/lib/billing/mrr-snapshot";

describe("createMrrSnapshotForToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix "today" so the test is deterministic regardless of wall clock.
    vi.setSystemTime(new Date("2026-05-13T10:30:00Z"));
    snapshotFindUnique.mockReset();
    snapshotCreate.mockReset();
    subFindMany.mockReset();
    logInfo.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a snapshot when none exists for today, truncating the date to UTC midnight", async () => {
    snapshotFindUnique.mockResolvedValueOnce(null);
    subFindMany.mockResolvedValueOnce([
      {
        planId: "p1",
        periodMonths: 1,
        plan: {
          prices: [{ periodMonths: 1, priceKopeks: 99_000, isActive: true }],
        },
      },
      {
        planId: "p2",
        periodMonths: 12,
        plan: {
          prices: [{ periodMonths: 12, priceKopeks: 1_200_000, isActive: true }],
        },
      },
    ]);
    snapshotCreate.mockImplementationOnce(async ({ data }) => ({
      snapshotDate: data.snapshotDate,
      mrrKopeks: data.mrrKopeks,
      activeSubscriptionsCount: data.activeSubscriptionsCount,
    }));

    const result = await createMrrSnapshotForToday();

    expect(result.created).toBe(true);
    expect(result.snapshot.activeSubscriptionsCount).toBe(2);
    // 99_000 (1-month) + 100_000 (1_200_000 / 12) = 199_000
    expect(result.snapshot.mrrKopeks).toBe(BigInt(199_000));
    // UTC midnight, not 10:30 local
    expect(result.snapshot.snapshotDate.toISOString()).toBe(
      "2026-05-13T00:00:00.000Z",
    );
    expect(snapshotCreate).toHaveBeenCalledTimes(1);
    expect(logInfo).toHaveBeenCalledWith(
      "mrr.snapshot.created",
      expect.objectContaining({ activeCount: 2 }),
    );
  });

  it("returns the existing row when today's snapshot already exists (idempotent)", async () => {
    snapshotFindUnique.mockResolvedValueOnce({
      snapshotDate: new Date("2026-05-13T00:00:00Z"),
      mrrKopeks: BigInt(500_000),
      activeSubscriptionsCount: 7,
    });

    const result = await createMrrSnapshotForToday();

    expect(result.created).toBe(false);
    expect(result.snapshot.activeSubscriptionsCount).toBe(7);
    expect(result.snapshot.mrrKopeks).toBe(BigInt(500_000));
    // We never even touched the subs / create flow.
    expect(subFindMany).not.toHaveBeenCalled();
    expect(snapshotCreate).not.toHaveBeenCalled();
  });

  it("falls back to re-read when create races and loses (P2002 path)", async () => {
    snapshotFindUnique
      .mockResolvedValueOnce(null) // first lookup: empty
      .mockResolvedValueOnce({      // fallback after race
        snapshotDate: new Date("2026-05-13T00:00:00Z"),
        mrrKopeks: BigInt(123_000),
        activeSubscriptionsCount: 3,
      });
    subFindMany.mockResolvedValueOnce([]);
    snapshotCreate.mockRejectedValueOnce(
      new Error("Unique constraint failed"),
    );

    const result = await createMrrSnapshotForToday();

    expect(result.created).toBe(false);
    expect(result.snapshot.activeSubscriptionsCount).toBe(3);
  });

  it("substitutes 0 priceKopeks for subscriptions missing a matching price row", async () => {
    snapshotFindUnique.mockResolvedValueOnce(null);
    subFindMany.mockResolvedValueOnce([
      {
        planId: "p1",
        periodMonths: 3,
        // Plan has only a 1-month price → 3-month sub gets no match.
        plan: {
          prices: [{ periodMonths: 1, priceKopeks: 99_000, isActive: true }],
        },
      },
    ]);
    snapshotCreate.mockImplementationOnce(async ({ data }) => ({
      snapshotDate: data.snapshotDate,
      mrrKopeks: data.mrrKopeks,
      activeSubscriptionsCount: data.activeSubscriptionsCount,
    }));

    const result = await createMrrSnapshotForToday();

    expect(result.snapshot.mrrKopeks).toBe(BigInt(0));
    expect(result.snapshot.activeSubscriptionsCount).toBe(1);
  });
});

describe("getMrrSnapshotDaysAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T10:30:00Z"));
    snapshotFindUnique.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries the snapshot for the date exactly N UTC days before today", async () => {
    snapshotFindUnique.mockResolvedValueOnce({
      mrrKopeks: BigInt(800_000),
      activeSubscriptionsCount: 12,
    });

    const result = await getMrrSnapshotDaysAgo(30);

    expect(snapshotFindUnique).toHaveBeenCalledWith({
      where: { snapshotDate: new Date("2026-04-13T00:00:00Z") },
      select: { mrrKopeks: true, activeSubscriptionsCount: true },
    });
    expect(result).toEqual({ mrrKopeks: BigInt(800_000), activeSubscriptionsCount: 12 });
  });

  it("returns null when no snapshot exists for the target date", async () => {
    snapshotFindUnique.mockResolvedValueOnce(null);
    expect(await getMrrSnapshotDaysAgo(30)).toBeNull();
  });
});

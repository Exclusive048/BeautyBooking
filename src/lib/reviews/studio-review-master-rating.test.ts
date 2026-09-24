import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recalculateTargetRatings } from "./recalculate-ratings";
import { targetReviewsWhere } from "./review-scope";

/**
 * STUDIO-REVIEW-MASTER-RATING (2026-09-24, решение владельца) — отзыв о визите
 * в студию засчитывается студии И мастеру-исполнителю (`Review.masterId`).
 *
 * @probe 2026-09-24 — в `recalculateTargetRatings` убран второй пересчёт
 * (мастера): красный «визит в студию пересчитывает и студию, и мастера».
 * Возвращено — зелёный.
 * @probe 2026-09-24 — из `targetReviewsWhere` убрана ветка
 * `{ targetType: "studio", masterId }`: красный «у мастера — и отзывы о визитах
 * в студию» (и список, и рейтинг читают одно правило). Возвращено — зелёный.
 */

function fakeTx() {
  const calls: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async (sql: { values: unknown[] }) => {
      calls.push(`lock:${String(sql.values[0])}`);
      return [];
    }),
    review: {
      aggregate: vi.fn(async (args: { where: unknown }) => {
        calls.push(`aggregate:${JSON.stringify(args.where)}`);
        return { _avg: { rating: 4.5 }, _count: { _all: 2 } };
      }),
    },
    provider: {
      update: vi.fn(async (args: { where: { id: string } }) => {
        calls.push(`provider:${args.where.id}`);
        return {};
      }),
    },
    studio: {
      findUnique: vi.fn(async () => ({ id: "studio-row" })),
      update: vi.fn(async () => {
        calls.push("studio-row");
        return {};
      }),
    },
  };
  return { tx, calls };
}

describe("targetReviewsWhere", () => {
  it("у мастера — и отзывы о визитах в студию, где он исполнитель", () => {
    const where = targetReviewsWhere("provider", "m1");
    expect(where.OR).toEqual([
      { targetType: "provider", targetId: "m1" },
      { targetType: "studio", masterId: "m1" },
    ]);
    expect(where.deletedAt).toBeNull();
  });

  it("у студии — только её отзывы", () => {
    expect(targetReviewsWhere("studio", "s1")).toEqual({ targetType: "studio", targetId: "s1", deletedAt: null });
  });
});

describe("recalculateTargetRatings", () => {
  it("визит в студию пересчитывает и студию, и мастера — студия первой", async () => {
    const { tx, calls } = fakeTx();
    await recalculateTargetRatings(tx as never, { targetType: "studio", targetId: "s1", masterId: "m1" });

    const locks = calls.filter((call) => call.startsWith("lock:"));
    expect(locks).toEqual(["lock:s1", "lock:m1"]);
    expect(calls).toContain("provider:s1");
    expect(calls).toContain("provider:m1");
    expect(calls).toContain("studio-row");
    // у мастера агрегат — по общему правилу, включая визиты в студию
    expect(calls.find((call) => call.startsWith("aggregate:") && call.includes('"masterId":"m1"'))).toBeTruthy();
  });

  it("отзыв о личном визите — один пересчёт", async () => {
    const { tx, calls } = fakeTx();
    await recalculateTargetRatings(tx as never, { targetType: "provider", targetId: "m1", masterId: null });
    expect(calls.filter((call) => call.startsWith("lock:"))).toEqual(["lock:m1"]);
  });

  it("визит в студию без исполнителя — только студия", async () => {
    const { tx, calls } = fakeTx();
    await recalculateTargetRatings(tx as never, { targetType: "studio", targetId: "s1", masterId: null });
    expect(calls.filter((call) => call.startsWith("lock:"))).toEqual(["lock:s1"]);
  });
});

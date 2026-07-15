import { describe, expect, it } from "vitest";
import {
  BAYESIAN_CONFIDENCE_M,
  BAYESIAN_PRIOR_FALLBACK,
  bayesianRating,
  sortByBayesianRating,
  type RatingRankable,
} from "@/lib/catalog/ranking";

// CATALOG-RANKING-01 — regression net for the «По рейтингу» ranking math.
// The defect this guards: raw-average sorting let 5.0/1-review outrank
// 4.9/47-review across the whole catalog.

const C = 4; // prior ≈ the measured global mean (3.9958)

const row = (over: Partial<RatingRankable> & { id: string }): RatingRankable => ({
  ratingAvg: 0,
  reviews: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  ...over,
});

describe("bayesianRating", () => {
  it("THE defect: 5.0 with one review ranks below 4.9 with many", () => {
    const oneReviewWonder = bayesianRating({ rating: 5, reviews: 1, prior: C });
    const provenMaster = bayesianRating({ rating: 4.9, reviews: 47, prior: C });
    expect(oneReviewWonder).toBeLessThan(provenMaster);
  });

  it("returns exactly the prior for an unrated provider (never NaN or 0)", () => {
    const score = bayesianRating({ rating: 0, reviews: 0, prior: C });
    expect(score).toBe(C);
    expect(Number.isNaN(score)).toBe(false);
  });

  it("matches the closed form (v*R + m*C) / (v + m)", () => {
    const v = 3;
    const r = 4.5;
    const m = BAYESIAN_CONFIDENCE_M;
    expect(bayesianRating({ rating: r, reviews: v, prior: C })).toBeCloseTo(
      (v * r + m * C) / (v + m),
      10,
    );
  });

  it("converges toward the provider's own average as reviews accumulate", () => {
    const few = bayesianRating({ rating: 5, reviews: 2, prior: C });
    const many = bayesianRating({ rating: 5, reviews: 500, prior: C });
    expect(many).toBeGreaterThan(few);
    expect(many).toBeCloseTo(5, 1);
  });

  it("pulls toward the prior from BELOW too (a harsh single review isn't fatal)", () => {
    const score = bayesianRating({ rating: 1, reviews: 1, prior: C });
    expect(score).toBeGreaterThan(1);
    expect(score).toBeLessThan(C);
  });

  it("never exceeds the honest bounds of the inputs", () => {
    const score = bayesianRating({ rating: 5, reviews: 10, prior: C });
    expect(score).toBeGreaterThan(C);
    expect(score).toBeLessThan(5);
  });

  it("survives NaN/negative junk rather than poisoning the sort", () => {
    expect(bayesianRating({ rating: Number.NaN, reviews: 5, prior: C })).toBeCloseTo(
      (5 * 0 + BAYESIAN_CONFIDENCE_M * C) / (5 + BAYESIAN_CONFIDENCE_M),
      10,
    );
    // Negative review count is treated as "no reviews" → the prior.
    expect(bayesianRating({ rating: 5, reviews: -3, prior: C })).toBe(C);
    // Unusable prior falls back rather than producing NaN.
    expect(bayesianRating({ rating: 5, reviews: 1, prior: Number.NaN })).toBeCloseTo(
      (1 * 5 + BAYESIAN_CONFIDENCE_M * BAYESIAN_PRIOR_FALLBACK) / (1 + BAYESIAN_CONFIDENCE_M),
      10,
    );
  });

  it("honours a custom confidence weight (m is tunable)", () => {
    const light = bayesianRating({ rating: 5, reviews: 1, prior: C, confidence: 1 });
    const heavy = bayesianRating({ rating: 5, reviews: 1, prior: C, confidence: 50 });
    // More smoothing → closer to the prior.
    expect(heavy).toBeLessThan(light);
    expect(heavy).toBeCloseTo(C, 1);
  });
});

describe("sortByBayesianRating", () => {
  it("orders the proven master above the one-review 5.0s", () => {
    const ranked = sortByBayesianRating(
      [
        row({ id: "wonder", ratingAvg: 5, reviews: 1 }),
        row({ id: "proven", ratingAvg: 4.9, reviews: 47 }),
        row({ id: "unrated", ratingAvg: 0, reviews: 0 }),
      ],
      C,
    );
    expect(ranked.map((r) => r.id)).toEqual(["proven", "wonder", "unrated"]);
  });

  it("places unrated providers mid-pack — below good, above genuinely bad", () => {
    const ranked = sortByBayesianRating(
      [
        row({ id: "unrated", ratingAvg: 0, reviews: 0 }),
        row({ id: "bad", ratingAvg: 1.5, reviews: 20 }),
        row({ id: "good", ratingAvg: 4.8, reviews: 20 }),
      ],
      C,
    );
    expect(ranked.map((r) => r.id)).toEqual(["good", "unrated", "bad"]);
  });

  it("breaks ties deterministically (reviews → createdAt → id)", () => {
    const older = new Date("2025-01-01T00:00:00.000Z");
    const newer = new Date("2026-01-01T00:00:00.000Z");
    const ranked = sortByBayesianRating(
      [
        row({ id: "b", ratingAvg: 4.5, reviews: 10, createdAt: older }),
        row({ id: "a", ratingAvg: 4.5, reviews: 10, createdAt: newer }),
        row({ id: "c", ratingAvg: 4.5, reviews: 12, createdAt: older }),
      ],
      C,
    );
    // Same score → more reviews first, then newer, then id asc.
    expect(ranked.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ id: "wonder", ratingAvg: 5, reviews: 1 }),
      row({ id: "proven", ratingAvg: 4.9, reviews: 47 }),
    ];
    sortByBayesianRating(rows, C);
    expect(rows.map((r) => r.id)).toEqual(["wonder", "proven"]);
  });
});

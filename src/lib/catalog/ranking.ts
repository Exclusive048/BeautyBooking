// CATALOG-RANKING-01 — Bayesian («true Bayesian» / weighted) rating score for
// the catalog «По рейтингу» sort.
//
// The defect it replaces: sorting by raw `ratingAvg` desc let `5.0 (1 отзыв)`
// outrank `4.9 (47 отзывов)` — on live data the whole top of the catalog was
// 5.0/1-review providers. For a marketplace that is a trust defect: one
// friendly review outranked a proven master.
//
// Artem's decision: Bayesian smoothing, NOT a minimum-review threshold. A
// threshold buries good new masters outright (starves supply at launch);
// Bayesian degrades gracefully — a few-review provider sits near the prior and
// converges to its own average as reviews accumulate.
//
// This module is intentionally PURE (no Prisma, no cache, no server-only
// imports) so the formula is unit-testable on its own; the prior `C` is
// resolved by the caller (see `loadGlobalMeanRating` in catalog.service.ts).

/**
 * `m` — the confidence weight: roughly the review count at which a provider's
 * own average starts to dominate the prior. Higher = more smoothing.
 *
 * Tuning notes (measured on the 2026-07-15 dataset, C ≈ 4.0):
 *   - `5.0` with  1 review → 4.16  (was #1 in the catalog; now mid-pack)
 *   - `4.9` with 47 reviews → 4.81  (now #1 — the intended flip)
 *   - `5.0` with  5 reviews → 4.50  (still below the proven master — correct)
 * The median review count among rated providers is currently **1**, so the
 * common "m = median review count" heuristic would be m=1 → almost no
 * smoothing → the defect survives. A small fixed value is the right call for a
 * young marketplace. Expect to raise this as review volume grows.
 */
export const BAYESIAN_CONFIDENCE_M = 5;

/**
 * Fallback prior, used only when the global mean can't be resolved (empty
 * catalog / no rated providers yet). Mid-upper of the 1–5 scale: with no data
 * every provider scores the prior anyway, so ordering falls to the tiebreakers.
 */
export const BAYESIAN_PRIOR_FALLBACK = 4;

export type BayesianInput = {
  /** `R` — the provider's own average rating. */
  rating: number;
  /** `v` — the provider's review count. */
  reviews: number;
  /** `C` — the global mean rating across rated providers (the prior). */
  prior: number;
  /** `m` — confidence weight. Defaults to {@link BAYESIAN_CONFIDENCE_M}. */
  confidence?: number;
};

/**
 * score = (v / (v + m)) * R + (m / (v + m)) * C
 *
 * Written as `(v*R + m*C) / (v + m)` — algebraically identical, one division.
 *
 * With `v = 0` this returns exactly `C` (the prior), never `NaN` or `0`: an
 * unrated provider sits mid-pack rather than at the top (raw 0 avg would have
 * sunk it, a 5.0 first review would have rocketed it).
 */
export function bayesianRating({
  rating,
  reviews,
  prior,
  confidence = BAYESIAN_CONFIDENCE_M,
}: BayesianInput): number {
  const safePrior = Number.isFinite(prior) ? prior : BAYESIAN_PRIOR_FALLBACK;
  const m = Number.isFinite(confidence) && confidence > 0 ? confidence : BAYESIAN_CONFIDENCE_M;
  // `ratingAvg` is 0 and `reviews` is 0 for never-rated providers; guard both
  // against nulls/NaN so a bad row can't poison the sort with NaN (NaN
  // comparisons are false → non-deterministic order).
  const v = Number.isFinite(reviews) && reviews > 0 ? reviews : 0;
  const r = Number.isFinite(rating) ? rating : 0;
  if (v === 0) return safePrior;
  return (v * r + m * safePrior) / (v + m);
}

export type RatingRankable = {
  id: string;
  ratingAvg: number;
  reviews: number;
  createdAt: Date;
};

/**
 * Order providers by Bayesian score, descending.
 *
 * Tiebreakers mirror the catalog's existing deterministic chain
 * (`reviews desc → createdAt desc → id asc`) so equal-score rows keep a stable,
 * reproducible order across pages.
 */
export function sortByBayesianRating<T extends RatingRankable>(rows: T[], prior: number): T[] {
  return [...rows]
    .map((row) => ({
      row,
      score: bayesianRating({ rating: row.ratingAvg, reviews: row.reviews, prior }),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.row.reviews - a.row.reviews ||
        b.row.createdAt.getTime() - a.row.createdAt.getTime() ||
        (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0),
    )
    .map((entry) => entry.row);
}

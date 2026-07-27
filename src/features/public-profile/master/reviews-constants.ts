// REVIEWS-LOADMORE-01 — page sizes shared by the SSR fetch (server component
// `sections/reviews-section.tsx`) and the inline «Показать больше» pager
// (client component `reviews-preview.tsx`).
//
// Kept in a plain module (no "use client", no server-only imports) so BOTH
// sides import the same numbers — see CLAUDE.md rule 13.
//
// «Is there more?» is answered with an **n+1 probe**: ask for one row beyond
// the page, render the page, and treat the extra row purely as the signal.
// The `Provider.reviews` aggregate cannot answer it — it drifts from the real
// active-review count in BOTH directions (seed: Анна 47 stored / 54 real;
// Марина 0 stored / 3 real), so gating on it either strands reviews behind a
// hidden button or spins on an empty one. The probe row is discarded, not
// rendered, and reappears as the first row of the next page — no gap, no dupe.

/** Reviews rendered server-side on first paint. */
export const REVIEWS_PREVIEW_LIMIT = 3;

/**
 * Reviews appended per «Показать больше отзывов» click. Matches the API default
 * (`listReviewsQuerySchema.limit` default 20, max 100) — deliberately not
 * "fetch everything", which is the truncation bug this replaces.
 */
export const REVIEWS_PAGE_SIZE = 20;

/**
 * Ask for one extra row to learn whether a further page exists, without a
 * dud click that loads nothing. Both fetch sizes stay inside the API's max=100.
 */
export const reviewsProbeLimit = (pageSize: number) => pageSize + 1;

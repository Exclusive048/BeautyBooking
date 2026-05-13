import type {
  ReviewReportReason,
  ReviewTargetType,
} from "@prisma/client";

/** Which subset of reviews the admin is looking at. URL-driven via
 * `?tab=flagged|low|all`; default `flagged` because that's the
 * "needs work right now" view. */
export type AdminReviewTab = "flagged" | "low" | "all";

export type AdminReviewRow = {
  id: string;
  /** Masked name — "Алексей И." or "Удалённый аккаунт" when the
   * `Review.author` user is hard-deleted (currently never — schema
   * cascades reviews on user delete — kept as defensive `| null`). */
  authorDisplay: string;
  authorId: string | null;
  target: {
    type: ReviewTargetType;
    id: string;
    name: string | null;
  };
  rating: number;
  text: string | null;
  /** Master reply if present (display-only — admin doesn't edit it). */
  replyText: string | null;
  createdAt: string;
  isReported: boolean;
  reportReason: ReviewReportReason | null;
  reportComment: string | null;
  reportedAt: string | null;
  /** Heuristic — `reportedAt && (rating === 1 || reason === OFFENSIVE)`.
   * Drives the «срочно» badge + KPI urgent-count. */
  isUrgent: boolean;
};

export type AdminReviewsCounts = {
  flagged: number;
  low: number;
  all: number;
};

export type AdminReviewsListResponse = {
  items: AdminReviewRow[];
  nextCursor: string | null;
};

export type AdminReviewsKpis = {
  pendingReports: {
    count: number;
    urgentCount: number;
  };
  reviewsToday: {
    count: number;
    /** Delta vs 7-day rolling average. `null` when there are no
     * comparable days (very fresh install). */
    deltaPercentVsAvg: number | null;
  };
  averageRating: {
    /** 0–5, rounded to one decimal. `null` when there are no
     * reviews to average. */
    value: number | null;
    totalReviews: number;
  };
  /** Soft-delete activity over the trailing 7 days, paired with the
   * size of the active review pool for context. Powered by
   * `Review.deletedAt` after REVIEW-SOFT-DELETE-A — no longer ever
   * `null` in practice, but the union is kept for forward-compat
   * (e.g. if we ever want to disable the tile). */
  deletedLastWeek: {
    count: number;
    totalReviews: number;
  } | null;
};

/**
 * STUDIO-REVIEWS-A — types for the studio cabinet reviews page.
 *
 * `Review.replyText` carries the master's (or studio's) public reply.
 * No `repliedByUserId` field exists in the schema — reply identity is
 * implicit. Per user spec the studio UI **always** labels replies as
 * «Ответ студии» regardless of whether an admin or a master typed them,
 * so we don't surface an identity hint.
 *
 * `canReply` enforces CRM scope at the service layer:
 *   OWNER / STUDIO_ADMIN  → true for every studio review
 *   MASTER (in studio)    → true only for reviews where `masterId`
 *                            matches the master's Provider id
 */

export type StudioReviewFilter = "all" | "no_reply" | "low_rating" | "five_star";

export type StudioReviewMasterChip = {
  id: string;
  displayName: string;
};

export type StudioReviewItem = {
  id: string;
  clientName: string;
  rating: number; // 1..5
  createdAt: string; // ISO
  /** Localised relative-date label like «сегодня» / «3 дня назад». */
  dateLabel: string;
  master: StudioReviewMasterChip | null;
  serviceName: string | null;
  text: string;
  reply: {
    text: string;
    repliedAt: string;
  } | null;
  canReply: boolean;
  /** Already reported (one report per review per platform-wide rule). */
  isReported: boolean;
};

export type StudioReviewsFilterCounts = Record<StudioReviewFilter, number>;

export type StudioReviewsListData = {
  items: StudioReviewItem[];
  filterCounts: StudioReviewsFilterCounts;
  nextCursor: string | null;
  masterOptions: StudioReviewMasterChip[];
  totalReviewsCount: number;
  unansweredCount: number;
};

export type StudioReviewsStarBucket = {
  stars: 1 | 2 | 3 | 4 | 5;
  count: number;
  percent: number;
};

export type StudioReviewsTopService = {
  serviceName: string;
  reviewCount: number;
};

export type StudioReviewsStats = {
  averageRating: number; // 2 d.p.
  totalReviews: number;
  positivePercent: number; // 4-5★ share
  distribution: StudioReviewsStarBucket[];
  topServicesByReviews: StudioReviewsTopService[];
};

export function isStudioReviewFilter(value: unknown): value is StudioReviewFilter {
  return value === "all" || value === "no_reply" || value === "low_rating" || value === "five_star";
}

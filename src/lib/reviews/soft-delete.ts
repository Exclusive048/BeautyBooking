import type { Prisma } from "@prisma/client";

/** Filter to apply to **every** review query whose results surface
 * outside the admin moderation tools — public profiles, cabinets,
 * rating recalculations, AI summaries, statistics, eligibility
 * checks. Soft-deleted reviews (set by admin moderation in
 * REVIEW-SOFT-DELETE-A) must be invisible to non-admin code paths.
 *
 * Note: admin moderation also filters deleted reviews — there is no
 * "show deleted" tab in this commit. Restoration is a manual SQL
 * operation (`UPDATE Review SET deletedAt = NULL WHERE id = ?`),
 * intentionally without UI flow per the scope decision. */
export const ACTIVE_REVIEW_FILTER: Pick<Prisma.ReviewWhereInput, "deletedAt"> = {
  deletedAt: null,
};

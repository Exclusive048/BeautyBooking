import "server-only";

import { ReviewTargetType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { maskAuthorDisplay } from "@/features/admin-cabinet/reviews/lib/author-mask";
import { isUrgentReport } from "@/features/admin-cabinet/reviews/lib/urgency";
import type {
  AdminReviewRow,
  AdminReviewTab,
  AdminReviewsCounts,
  AdminReviewsListResponse,
} from "@/features/admin-cabinet/reviews/types";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

type ListOpts = {
  tab?: AdminReviewTab;
  search?: string;
  cursor?: string | null;
  pageSize?: number;
};

function buildWhere(opts: ListOpts): Prisma.ReviewWhereInput {
  // Always exclude soft-deleted reviews from the admin moderation
  // surface. There is no "show deleted" tab in this commit — restoration
  // is a manual SQL operation (see `delete-review.service.ts`).
  const conds: Prisma.ReviewWhereInput[] = [ACTIVE_REVIEW_FILTER];
  if (opts.tab === "flagged") {
    conds.push({ reportedAt: { not: null } });
  } else if (opts.tab === "low") {
    conds.push({ rating: { lte: 2 } });
  }
  const q = opts.search?.trim();
  if (q) {
    conds.push({
      OR: [
        { text: { contains: q, mode: "insensitive" } },
        { reportComment: { contains: q, mode: "insensitive" } },
        {
          author: {
            displayName: { contains: q, mode: "insensitive" },
          },
        },
      ],
    });
  }
  if (conds.length === 1) return conds[0]!;
  return { AND: conds };
}

/**
 * Lists reviews for the admin moderation surface.
 *
 * Sort: when filtering by `flagged`, surface the freshest report
 * first (admin works through the queue chronologically). Otherwise
 * newest-by-creation order applies. Cursor pagination on `id` —
 * matches the conventions of `/admin/users` and `/admin/billing`.
 *
 * Eagerly includes author + the two possible target relations
 * (master / studio) so the row mapper has everything it needs
 * without per-row queries.
 */
export async function listAdminReviews(
  opts: ListOpts = {},
): Promise<AdminReviewsListResponse> {
  const pageSize = Math.min(
    Math.max(opts.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const tab = opts.tab ?? "flagged";

  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    tab === "flagged"
      ? [{ reportedAt: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

  const rows = await prisma.review.findMany({
    where: buildWhere(opts),
    orderBy,
    take: pageSize + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      rating: true,
      text: true,
      replyText: true,
      reportedAt: true,
      reportReason: true,
      reportComment: true,
      createdAt: true,
      targetType: true,
      targetId: true,
      author: {
        select: { id: true, displayName: true },
      },
      master: { select: { id: true, name: true } },
      studio: { select: { id: true, provider: { select: { name: true } } } },
    },
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  const items: AdminReviewRow[] = page.map((row): AdminReviewRow => {
    const targetName =
      row.targetType === ReviewTargetType.provider
        ? row.master?.name ?? null
        : row.studio?.provider?.name ?? null;
    return {
      id: row.id,
      authorDisplay: maskAuthorDisplay(row.author?.displayName ?? null),
      authorId: row.author?.id ?? null,
      target: {
        type: row.targetType,
        id: row.targetId,
        name: targetName,
      },
      rating: row.rating,
      text: row.text,
      replyText: row.replyText,
      createdAt: row.createdAt.toISOString(),
      isReported: row.reportedAt !== null,
      reportReason: row.reportReason,
      reportComment: row.reportComment,
      reportedAt: row.reportedAt?.toISOString() ?? null,
      isUrgent: isUrgentReport({
        reportedAt: row.reportedAt,
        rating: row.rating,
        reportReason: row.reportReason,
      }),
    };
  });

  return { items, nextCursor };
}

/** Tab badge counts. Single grouped trio of count() calls — small
 * fixed cost regardless of total review volume. Soft-deleted reviews
 * are excluded so the badges match what the admin actually sees in
 * the corresponding tab. */
export async function getReviewTabCounts(): Promise<AdminReviewsCounts> {
  const [flagged, low, all] = await Promise.all([
    prisma.review.count({
      where: { ...ACTIVE_REVIEW_FILTER, reportedAt: { not: null } },
    }),
    prisma.review.count({
      where: { ...ACTIVE_REVIEW_FILTER, rating: { lte: 2 } },
    }),
    prisma.review.count({ where: ACTIVE_REVIEW_FILTER }),
  ]);
  return { flagged, low, all };
}

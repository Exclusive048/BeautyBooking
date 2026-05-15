import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import type { ReviewTargetType, Prisma } from "@prisma/client";

const dismissSchema = z.object({
  action: z.enum(["dismiss_report"]),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function recalculateTargetRatings(
  tx: Prisma.TransactionClient,
  targetType: ReviewTargetType,
  targetId: string
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: { targetType, targetId, ...ACTIVE_REVIEW_FILTER },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const ratingAvg = aggregate._avg.rating ?? 0;
  const ratingCount = aggregate._count._all ?? 0;

  try {
    await tx.provider.update({
      where: { id: targetId },
      data: { ratingAvg, ratingCount, rating: ratingAvg, reviews: ratingCount },
    });
  } catch {
    // provider might not exist for studio target type
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Отзыв не найден.", 404, "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = dismissSchema.safeParse(body);
    if (!parsed.success) return fail("Неверные данные.", 400, "VALIDATION_ERROR");

    const review = await prisma.review.findUnique({
      where: { id },
      select: { id: true, reportedAt: true },
    });
    if (!review) return fail("Отзыв не найден.", 404, "NOT_FOUND");
    if (!review.reportedAt) return fail("Отзыв не был помечен как жалоба.", 400, "NOT_REPORTED");

    await prisma.review.update({
      where: { id },
      data: { reportedAt: null, reportComment: null, reportReason: null },
    });

    return ok({ id, dismissed: true });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Отзыв не найден.", 404, "NOT_FOUND");

    const review = await prisma.review.findUnique({
      where: { id },
      select: { id: true, targetType: true, targetId: true, deletedAt: true },
    });

    if (!review) {
      return fail("Отзыв не найден.", 404, "NOT_FOUND");
    }

    // Idempotent: already soft-deleted — return success without
    // re-running the rating recalc. Matches the new admin delete
    // service in `delete-review.service.ts`.
    if (review.deletedAt) {
      return ok({ id });
    }

    // Soft delete (REVIEW-SOFT-DELETE-A). The new admin UI uses the
    // dedicated `POST /[id]/delete` route which also writes audit +
    // dispatches notification; this legacy DELETE handler keeps the
    // minimal flow (no audit/notify) for backwards compatibility.
    // BACKLOG: retire once no consumers remain.
    await prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedByUserId: auth.user.id,
        },
      });
      await recalculateTargetRatings(tx, review.targetType, review.targetId);
    });

    return ok({ id });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

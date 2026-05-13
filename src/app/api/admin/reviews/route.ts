import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { parseQuery } from "@/lib/validation";
import { AppError, toAppError } from "@/lib/api/errors";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

const querySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  reported: z.coerce.boolean().optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const query = parseQuery(new URL(req.url), querySchema);

    const rows = await prisma.review.findMany({
      where: {
        ...ACTIVE_REVIEW_FILTER,
        ...(query.reported === true ? { reportedAt: { not: null } } : {}),
        ...(query.minRating !== undefined || query.maxRating !== undefined
          ? {
              rating: {
                ...(query.minRating !== undefined ? { gte: query.minRating } : {}),
                ...(query.maxRating !== undefined ? { lte: query.maxRating } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
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
          select: {
            id: true,
            displayName: true,
            phone: true,
            email: true,
          },
        },
        master: {
          select: {
            id: true,
            name: true,
          },
        },
        studio: {
          select: {
            id: true,
            provider: { select: { name: true } },
          },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    const reviews = page.map((row) => ({
      id: row.id,
      rating: row.rating,
      text: row.text,
      replyText: row.replyText,
      reportedAt: row.reportedAt?.toISOString() ?? null,
      reportReason: row.reportReason ?? null,
      reportComment: row.reportComment ?? null,
      createdAt: row.createdAt.toISOString(),
      targetType: row.targetType,
      targetName: row.master?.name ?? row.studio?.provider?.name ?? null,
      author: {
        id: row.author.id,
        displayName: row.author.displayName,
        phone: row.author.phone,
        email: row.author.email,
      },
    }));

    return ok({ reviews, nextCursor });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

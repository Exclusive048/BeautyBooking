import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { parseQuery } from "@/lib/validation";
import { AppError, toAppError } from "@/lib/api/errors";

const querySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED", "PENDING"]).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const query = parseQuery(new URL(req.url), querySchema);

    const rows = await prisma.userSubscription.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        scope: true,
        status: true,
        periodMonths: true,
        autoRenew: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            email: true,
          },
        },
        plan: {
          select: { id: true, name: true, code: true, tier: true },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    const subscriptions = page.map((row) => ({
      id: row.id,
      scope: row.scope,
      status: row.status,
      periodMonths: row.periodMonths,
      autoRenew: row.autoRenew,
      currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      user: {
        id: row.user.id,
        displayName: row.user.displayName,
        phone: row.user.phone,
        email: row.user.email,
      },
      plan: row.plan,
    }));

    return ok({ subscriptions, nextCursor });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

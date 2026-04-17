import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { parseQuery } from "@/lib/validation";
import { AppError, toAppError } from "@/lib/api/errors";

const querySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z
    .enum(["PENDING", "SUCCEEDED", "CANCELED", "FAILED", "REFUNDED"])
    .optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const query = parseQuery(new URL(req.url), querySchema);

    const rows = await prisma.billingPayment.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        amountKopeks: true,
        yookassaPaymentId: true,
        createdAt: true,
        subscription: {
          select: {
            scope: true,
            user: {
              select: {
                id: true,
                displayName: true,
                phone: true,
                email: true,
              },
            },
            plan: {
              select: { name: true, code: true },
            },
          },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    const payments = page.map((row) => ({
      id: row.id,
      status: row.status,
      amountKopeks: row.amountKopeks,
      yookassaPaymentId: row.yookassaPaymentId,
      createdAt: row.createdAt.toISOString(),
      scope: row.subscription?.scope ?? null,
      planName: row.subscription?.plan?.name ?? null,
      user: row.subscription?.user
        ? {
            id: row.subscription.user.id,
            displayName: row.subscription.user.displayName,
            phone: row.subscription.user.phone,
            email: row.subscription.user.email,
          }
        : null,
    }));

    return ok({ payments, nextCursor });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Категория не найдена.", 404, "NOT_FOUND");

    const updated = await prisma.globalCategory.update({
      where: { id },
      data: { isActive: false, isValidated: false, isRejected: true },
      select: { id: true, isActive: true },
    });

    return ok({ category: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

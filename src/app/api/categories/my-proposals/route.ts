import { CategoryStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const categories = await prisma.globalCategory.findMany({
      where: {
        status: { not: CategoryStatus.APPROVED },
        OR: [{ createdByUserId: auth.user.id }, { proposedBy: auth.user.id }],
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        parentId: true,
        status: true,
        visibleToAll: true,
      },
    });

    return ok(
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        title: category.name,
        slug: category.slug,
        icon: category.icon,
        parentId: category.parentId,
        status: category.status,
        isPersonal: !category.visibleToAll,
      }))
    );
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

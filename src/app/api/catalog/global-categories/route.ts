import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { sortCategoriesHierarchically } from "@/lib/catalog/category-sort";
import { CategoryStatus, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function parseStatus(value: string | null): CategoryStatus | null {
  if (value === CategoryStatus.PENDING) return CategoryStatus.PENDING;
  if (value === CategoryStatus.APPROVED) return CategoryStatus.APPROVED;
  if (value === CategoryStatus.REJECTED) return CategoryStatus.REJECTED;
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionUser = await getSessionUser();
    const status = parseStatus(url.searchParams.get("status")) ?? CategoryStatus.APPROVED;
    const where: Prisma.GlobalCategoryWhereInput = sessionUser
      ? {
          OR: [
            { status: CategoryStatus.APPROVED, visibleToAll: true },
            { createdByUserId: sessionUser.id },
          ],
        }
      : {
          status,
          visibleToAll: true,
        };

    const categories = await prisma.globalCategory.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        usageCount: true,
        parentId: true,
        orderIndex: true,
        status: true,
        proposedBy: true,
        proposedAt: true,
        context: true,
        reviewedAt: true,
        isSystem: true,
        visibleToAll: true,
        visualSearchSlug: true,
        createdByUserId: true,
        createdByProviderId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const sorted = sortCategoriesHierarchically(categories);
    return ok({
      categories: sorted.map((category) => ({
        id: category.id,
        name: category.name,
        title: category.name,
        slug: category.slug,
        icon: category.icon,
        parentId: category.parentId,
        depth: category.depth,
        fullPath: category.fullPath,
        usageCount: category.usageCount,
        status: category.status,
        isPersonal: !category.visibleToAll,
        visibleToAll: category.visibleToAll,
        createdByUserId: category.createdByUserId,
      })),
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

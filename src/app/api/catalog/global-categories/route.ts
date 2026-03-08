import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { sortCategoriesHierarchically } from "@/lib/catalog/category-sort";
import { CategoryStatus, type Prisma } from "@prisma/client";

export async function GET() {
  try {
    const where: Prisma.GlobalCategoryWhereInput = {
      status: CategoryStatus.APPROVED,
      isSystem: false,
      NOT: [{ visualSearchSlug: "hot" }],
    };

    const categories = await prisma.globalCategory.findMany({
      where,
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
        title: category.name,
        slug: category.slug,
        icon: category.icon,
        parentId: category.parentId,
        depth: category.depth,
        fullPath: category.fullPath,
        usageCount: category.usageCount,
      })),
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

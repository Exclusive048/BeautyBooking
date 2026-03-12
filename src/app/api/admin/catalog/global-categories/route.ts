import { CategoryStatus, type Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { sortCategoriesHierarchically } from "@/lib/catalog/category-sort";

function parseStatus(value: string | null): CategoryStatus | null {
  if (value === CategoryStatus.PENDING) return CategoryStatus.PENDING;
  if (value === CategoryStatus.APPROVED) return CategoryStatus.APPROVED;
  if (value === CategoryStatus.REJECTED) return CategoryStatus.REJECTED;
  return null;
}

function statusOrder(status: CategoryStatus): number {
  if (status === CategoryStatus.PENDING) return 0;
  if (status === CategoryStatus.APPROVED) return 1;
  return 2;
}

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const status = parseStatus(url.searchParams.get("status"));

    const where: Prisma.GlobalCategoryWhereInput = status ? { status } : {};

    const rows = await prisma.globalCategory.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        parentId: true,
        orderIndex: true,
        status: true,
        proposedBy: true,
        proposedAt: true,
        context: true,
        reviewedAt: true,
        isSystem: true,
        usageCount: true,
        visibleToAll: true,
        visualSearchSlug: true,
        createdByUserId: true,
        createdByProviderId: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    const creatorById = new Map(rows.map((row) => [row.id, row.createdBy]));

    const sortedHierarchy = sortCategoriesHierarchically(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        icon: row.icon,
        parentId: row.parentId,
        orderIndex: row.orderIndex,
        status: row.status,
        proposedBy: row.proposedBy,
        proposedAt: row.proposedAt,
        context: row.context,
        reviewedAt: row.reviewedAt,
        isSystem: row.isSystem,
        usageCount: row.usageCount,
        visibleToAll: row.visibleToAll,
        visualSearchSlug: row.visualSearchSlug,
        createdByUserId: row.createdByUserId,
        createdByProviderId: row.createdByProviderId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
    );

    const orderById = new Map(sortedHierarchy.map((item, index) => [item.id, index]));

    const sorted = [...sortedHierarchy].sort((left, right) => {
      const byStatus = statusOrder(left.status) - statusOrder(right.status);
      if (byStatus !== 0) return byStatus;
      return (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0);
    });

    return ok({
      categories: sorted.map((category) => {
        const creator = creatorById.get(category.id);
        return {
          id: category.id,
          name: category.name,
          title: category.name,
          slug: category.slug,
          icon: category.icon,
          parentId: category.parentId,
          depth: category.depth,
          fullPath: category.fullPath,
          status: category.status,
          usageCount: category.usageCount,
          visibleToAll: category.visibleToAll,
          createdByUserId: category.createdByUserId,
          createdAt: category.createdAt.toISOString(),
          createdBy: creator
            ? {
                id: creator.id,
                name: creator.displayName || creator.phone || creator.email || null,
                displayName: creator.displayName,
                phone: creator.phone,
                email: creator.email,
                profileHref: `/admin/users?userId=${creator.id}`,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

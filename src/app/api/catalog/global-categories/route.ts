import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { sortCategoriesHierarchically } from "@/lib/catalog/category-sort";
import { CategoryStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Public catalog filter feed. Returns ONLY `APPROVED` +
 * `visibleToAll` categories — same answer for anonymous and logged-
 * in users.
 *
 * services-category-creation-restore: the previous branch added the
 * caller's own `createdByUserId` rows to the `OR` clause for logged-
 * in users. That meant a master who proposed «тестовая категория»
 * saw it in their own catalog filter (even before admin approval),
 * which the user reported as «какие то непонятные» — drafts leaking
 * into the public surface. Personal-scope categories belong only
 * in surfaces that ask for them (e.g. the master's own service
 * modal via `listAvailableGlobalCategories`), not in this endpoint.
 *
 * The `?status=` query parameter is no longer honoured — all four
 * call sites already pass `status=APPROVED`. Requesting PENDING or
 * REJECTED via this public route was a footgun; admins use a
 * separate `/api/admin/catalog/global-categories` route for that.
 */
export async function GET() {
  try {
    const categories = await prisma.globalCategory.findMany({
      where: { status: CategoryStatus.APPROVED, visibleToAll: true },
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

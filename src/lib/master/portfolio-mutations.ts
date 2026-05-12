import { CategoryStatus, Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { getMasterContext } from "@/lib/master/profile.service";
import { prisma } from "@/lib/prisma";

/**
 * Mutation helpers for the 31b portfolio management page.
 *
 * The existing `createMasterPortfolioItem` and `deleteMasterPortfolioItem`
 * in `profile.service.ts` cover create/delete; this file adds the two
 * operations that didn't exist before: full update (services + tags +
 * category + isPublic in one call) and reorder.
 */

export type ReorderDirection = "up" | "down";

export type UpdatePortfolioItemInput = {
  globalCategoryId?: string | null;
  serviceIds?: string[];
  tagIds?: string[];
  isPublic?: boolean;
};

export async function updateMasterPortfolioItem(
  masterId: string,
  itemId: string,
  input: UpdatePortfolioItemInput
): Promise<{ id: string; isPublic: boolean; globalCategoryId: string | null }> {
  const item = await prisma.portfolioItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      masterId: true,
      globalCategoryId: true,
      services: { select: { serviceId: true } },
      tags: { select: { tagId: true } },
    },
  });
  if (!item || item.masterId !== masterId) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  const context = await getMasterContext(masterId);
  const providerScope = context.isSolo ? masterId : context.studioProviderId!;

  const nextCategoryProvided = Object.prototype.hasOwnProperty.call(input, "globalCategoryId");
  const nextCategoryId = nextCategoryProvided ? (input.globalCategoryId?.trim() || null) : undefined;

  if (nextCategoryProvided && nextCategoryId) {
    const visibilityConditions: Prisma.GlobalCategoryWhereInput[] = [
      { status: CategoryStatus.APPROVED, visibleToAll: true },
    ];
    if (context.ownerUserId) {
      visibilityConditions.push({ createdByUserId: context.ownerUserId });
      visibilityConditions.push({ proposedBy: context.ownerUserId });
    }
    const category = await prisma.globalCategory.findFirst({
      where: { id: nextCategoryId, OR: visibilityConditions },
      select: { id: true, visualSearchSlug: true },
    });
    if (!category || category.visualSearchSlug === "hot") {
      throw new AppError("Global category not found", 404, "NOT_FOUND");
    }
  }

  const nextServiceIdsProvided = Array.isArray(input.serviceIds);
  const desiredServiceIds = nextServiceIdsProvided ? uniqueIds(input.serviceIds!) : null;
  if (desiredServiceIds && desiredServiceIds.length > 0) {
    const services = await prisma.service.findMany({
      where: { id: { in: desiredServiceIds }, providerId: providerScope },
      select: { id: true },
    });
    if (services.length !== desiredServiceIds.length) {
      throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
    }
  }

  const nextTagIdsProvided = Array.isArray(input.tagIds);
  const desiredTagIds = nextTagIdsProvided ? uniqueIds(input.tagIds!) : null;
  if (desiredTagIds && desiredTagIds.length > 0) {
    const tags = await prisma.tag.findMany({
      where: { id: { in: desiredTagIds } },
      select: { id: true },
    });
    if (tags.length !== desiredTagIds.length) {
      throw new AppError("Tag not found", 404, "NOT_FOUND");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Replace services set when caller provided a list (including empty
    // array — explicit clear). Skip when undefined.
    if (desiredServiceIds) {
      const existing = item.services.map((row) => row.serviceId);
      const toRemove = existing.filter((id) => !desiredServiceIds.includes(id));
      const toAdd = desiredServiceIds.filter((id) => !existing.includes(id));
      if (toRemove.length > 0) {
        await tx.portfolioItemService.deleteMany({
          where: { portfolioItemId: itemId, serviceId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.portfolioItemService.createMany({
          data: toAdd.map((serviceId) => ({ portfolioItemId: itemId, serviceId })),
        });
      }
    }

    // Same shape for tags + bump usageCount on adds, decrement on removes.
    if (desiredTagIds) {
      const existingTagIds = item.tags.map((row) => row.tagId);
      const toRemoveTags = existingTagIds.filter((id) => !desiredTagIds.includes(id));
      const toAddTags = desiredTagIds.filter((id) => !existingTagIds.includes(id));
      if (toRemoveTags.length > 0) {
        await tx.portfolioItemTag.deleteMany({
          where: { portfolioItemId: itemId, tagId: { in: toRemoveTags } },
        });
        await tx.tag.updateMany({
          where: { id: { in: toRemoveTags }, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
      if (toAddTags.length > 0) {
        await tx.portfolioItemTag.createMany({
          data: toAddTags.map((tagId) => ({ portfolioItemId: itemId, tagId })),
        });
        await tx.tag.updateMany({
          where: { id: { in: toAddTags } },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    if (nextCategoryProvided) {
      const oldCategoryId = item.globalCategoryId;
      if (oldCategoryId && oldCategoryId !== nextCategoryId) {
        await tx.globalCategory.updateMany({
          where: { id: oldCategoryId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
      if (nextCategoryId && nextCategoryId !== oldCategoryId) {
        await tx.globalCategory.updateMany({
          where: { id: nextCategoryId },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    const row = await tx.portfolioItem.update({
      where: { id: itemId },
      data: {
        ...(nextCategoryProvided ? { globalCategoryId: nextCategoryId, categorySource: "user" } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      },
      select: { id: true, isPublic: true, globalCategoryId: true },
    });

    return row;
  });

  await invalidateAdvisorCache(masterId);
  return updated;
}

/**
 * Swap `sortOrder` (and tie-breaker `createdAt`) with the neighbour in
 * the requested direction. Uses Serializable isolation so two quick
 * arrow clicks don't cross-fade two cards into the same slot.
 */
export async function reorderMasterPortfolio(
  masterId: string,
  itemId: string,
  direction: ReorderDirection
): Promise<{ id: string; sortOrder: number }> {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.portfolioItem.findUnique({
        where: { id: itemId },
        select: { id: true, masterId: true, sortOrder: true, createdAt: true },
      });
      if (!target || target.masterId !== masterId) {
        throw new AppError("Not found", 404, "NOT_FOUND");
      }

      // Find neighbour in the requested direction. Ordering matches the
      // grid: sortOrder asc, createdAt desc.
      const neighbour = await tx.portfolioItem.findFirst({
        where: {
          masterId,
          id: { not: itemId },
          OR:
            direction === "up"
              ? [
                  { sortOrder: { lt: target.sortOrder } },
                  { sortOrder: target.sortOrder, createdAt: { gt: target.createdAt } },
                ]
              : [
                  { sortOrder: { gt: target.sortOrder } },
                  { sortOrder: target.sortOrder, createdAt: { lt: target.createdAt } },
                ],
        },
        orderBy:
          direction === "up"
            ? [{ sortOrder: "desc" }, { createdAt: "asc" }]
            : [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: { id: true, sortOrder: true },
      });

      if (!neighbour) {
        // Already at the boundary — no-op.
        return { id: target.id, sortOrder: target.sortOrder };
      }

      // Two writes — assign distinct sort orders. If both rows shared the
      // same sortOrder, pick a fresh value above the higher of the two.
      const distinctOrders = target.sortOrder !== neighbour.sortOrder;
      const [targetNew, neighbourNew] = distinctOrders
        ? [neighbour.sortOrder, target.sortOrder]
        : direction === "up"
          ? [target.sortOrder, target.sortOrder + 1]
          : [target.sortOrder + 1, target.sortOrder];

      await tx.portfolioItem.update({
        where: { id: target.id },
        data: { sortOrder: targetNew },
      });
      await tx.portfolioItem.update({
        where: { id: neighbour.id },
        data: { sortOrder: neighbourNew },
      });

      return { id: target.id, sortOrder: targetNew };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

function uniqueIds(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

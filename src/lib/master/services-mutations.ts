import { CategoryStatus, DiscountType, Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { getMasterContext } from "@/lib/master/profile.service";
import { prisma } from "@/lib/prisma";

/**
 * Mutation helpers for the 31c master services + bundles management page.
 *
 * Why a fresh module rather than extending `profile.service.ts`:
 *   - Bundles (`ServicePackage`) are a brand-new concept — keeping the
 *     code path isolated avoids ballooning a 1000-line file further.
 *   - The new endpoints (`PATCH /[id]`, `reorder`) are scoped to solo
 *     master services. The legacy `upsertMasterServices` / `createSoloMasterService`
 *     in `profile.service.ts` still drive the studio-shared catalog and
 *     remain untouched.
 */

const FIELD_LIST = ["name", "title", "description", "durationMin", "price", "globalCategoryId", "isEnabled", "onlinePaymentEnabled"] as const;
type ServiceUpdateField = (typeof FIELD_LIST)[number];

export type UpdateMasterServiceInput = {
  name?: string;
  title?: string | null;
  description?: string | null;
  durationMin?: number;
  price?: number;
  globalCategoryId?: string | null;
  isEnabled?: boolean;
  onlinePaymentEnabled?: boolean;
};

export type ReorderDirection = "up" | "down";

export type CreateMasterPackageInput = {
  name: string;
  serviceIds: string[];
  discountType: DiscountType;
  discountValue: number;
  isEnabled?: boolean;
};

export type UpdateMasterPackageInput = Partial<CreateMasterPackageInput> & {
  isEnabled?: boolean;
};

/**
 * Update a single master-owned service. PATCH-style: only fields that
 * are present in the input are touched. Category change keeps the
 * `globalCategory.usageCount` counter in sync. `isActive` is **not**
 * exposed — it's an admin-controlled flag (moderation/archival) and
 * has separate semantics from the master-toggleable `isEnabled`.
 */
export async function updateMasterService(
  masterId: string,
  serviceId: string,
  input: UpdateMasterServiceInput
): Promise<{ id: string }> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, providerId: true, globalCategoryId: true },
  });
  if (!service || service.providerId !== masterId) {
    throw new AppError("Service not found", 404, "NOT_FOUND");
  }

  const context = await getMasterContext(masterId);

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

  const data: Prisma.ServiceUpdateInput = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new AppError("Name is required", 400, "VALIDATION_ERROR");
    data.name = trimmed;
    // Keep `title` in sync when not explicitly overridden — solo masters
    // typically don't distinguish; downstream `title || name` fallback
    // means we don't need to touch it explicitly.
  }
  if (input.title !== undefined) {
    data.title = typeof input.title === "string" ? input.title.trim() || null : null;
  }
  if (input.description !== undefined) {
    data.description =
      typeof input.description === "string" ? input.description.trim() || null : null;
  }
  if (input.durationMin !== undefined) data.durationMin = input.durationMin;
  if (input.price !== undefined) data.price = input.price;
  if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
  if (input.onlinePaymentEnabled !== undefined) {
    data.onlinePaymentEnabled = input.onlinePaymentEnabled;
  }

  await prisma.$transaction(async (tx) => {
    if (nextCategoryProvided) {
      data.globalCategory = nextCategoryId
        ? { connect: { id: nextCategoryId } }
        : { disconnect: true };

      const oldCategoryId = service.globalCategoryId;
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

    await tx.service.update({ where: { id: serviceId }, data });
  });

  await invalidateAdvisorCache(masterId);
  return { id: serviceId };
}

/**
 * Hard-delete a master-owned service. The DB enforces `Booking.serviceId
 * onDelete: Restrict` — we pre-count bookings to surface a friendly 409
 * error before Prisma raises P2003. The `BookingServiceItem.serviceId`
 * relation is `SetNull`, so historical line items keep their snapshot.
 */
export async function deleteMasterService(
  masterId: string,
  serviceId: string
): Promise<{ id: string; deleted: true }> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      providerId: true,
      globalCategoryId: true,
      _count: { select: { bookings: true } },
    },
  });
  if (!service || service.providerId !== masterId) {
    throw new AppError("Service not found", 404, "NOT_FOUND");
  }
  if (service._count.bookings > 0) {
    throw new AppError(
      "Услугу нельзя удалить — есть записи. Отключите её вместо этого.",
      409,
      "SERVICE_HAS_BOOKINGS"
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.service.delete({ where: { id: serviceId } });
    if (service.globalCategoryId) {
      await tx.globalCategory.updateMany({
        where: { id: service.globalCategoryId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }
  });

  await invalidateAdvisorCache(masterId);
  return { id: serviceId, deleted: true };
}

/**
 * Swap `sortOrder` with the adjacent neighbour. Same Serializable
 * isolation as the portfolio reorder helper (31b) so two quick clicks
 * never cross-fade. Boundary case = no-op.
 *
 * Reorder is **global** within the master's full service list (not
 * per-category) — accordions are visual grouping only.
 */
export async function reorderMasterService(
  masterId: string,
  serviceId: string,
  direction: ReorderDirection
): Promise<{ id: string; sortOrder: number }> {
  return reorderRow({
    masterId,
    rowId: serviceId,
    direction,
    table: "service",
  });
}

export async function reorderMasterPackage(
  masterId: string,
  packageId: string,
  direction: ReorderDirection
): Promise<{ id: string; sortOrder: number }> {
  return reorderRow({
    masterId,
    rowId: packageId,
    direction,
    table: "package",
  });
}

async function reorderRow(input: {
  masterId: string;
  rowId: string;
  direction: ReorderDirection;
  table: "service" | "package";
}): Promise<{ id: string; sortOrder: number }> {
  return prisma.$transaction(
    async (tx) => {
      const target =
        input.table === "service"
          ? await tx.service.findUnique({
              where: { id: input.rowId },
              select: { id: true, providerId: true, sortOrder: true, createdAt: true },
            })
          : await tx.servicePackage.findUnique({
              where: { id: input.rowId },
              select: { id: true, masterId: true, sortOrder: true, createdAt: true },
            });
      if (!target) {
        throw new AppError("Not found", 404, "NOT_FOUND");
      }
      const ownerId = "providerId" in target ? target.providerId : target.masterId;
      if (ownerId !== input.masterId) {
        throw new AppError("Not found", 404, "NOT_FOUND");
      }

      const neighbourWhere =
        input.direction === "up"
          ? [
              { sortOrder: { lt: target.sortOrder } },
              { sortOrder: target.sortOrder, createdAt: { gt: target.createdAt } },
            ]
          : [
              { sortOrder: { gt: target.sortOrder } },
              { sortOrder: target.sortOrder, createdAt: { lt: target.createdAt } },
            ];
      const orderBy =
        input.direction === "up"
          ? ([{ sortOrder: "desc" as const }, { createdAt: "asc" as const }])
          : ([{ sortOrder: "asc" as const }, { createdAt: "desc" as const }]);

      const neighbour =
        input.table === "service"
          ? await tx.service.findFirst({
              where: {
                providerId: input.masterId,
                id: { not: input.rowId },
                OR: neighbourWhere,
              },
              orderBy,
              select: { id: true, sortOrder: true },
            })
          : await tx.servicePackage.findFirst({
              where: {
                masterId: input.masterId,
                id: { not: input.rowId },
                OR: neighbourWhere,
              },
              orderBy,
              select: { id: true, sortOrder: true },
            });

      if (!neighbour) {
        return { id: target.id, sortOrder: target.sortOrder };
      }

      const distinctOrders = target.sortOrder !== neighbour.sortOrder;
      const [targetNew, neighbourNew] = distinctOrders
        ? [neighbour.sortOrder, target.sortOrder]
        : input.direction === "up"
          ? [target.sortOrder, target.sortOrder + 1]
          : [target.sortOrder + 1, target.sortOrder];

      if (input.table === "service") {
        await tx.service.update({ where: { id: target.id }, data: { sortOrder: targetNew } });
        await tx.service.update({ where: { id: neighbour.id }, data: { sortOrder: neighbourNew } });
      } else {
        await tx.servicePackage.update({
          where: { id: target.id },
          data: { sortOrder: targetNew },
        });
        await tx.servicePackage.update({
          where: { id: neighbour.id },
          data: { sortOrder: neighbourNew },
        });
      }

      return { id: target.id, sortOrder: targetNew };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function createMasterPackage(
  masterId: string,
  input: CreateMasterPackageInput
): Promise<{ id: string }> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new AppError("Name is required", 400, "VALIDATION_ERROR");
  }
  const uniqueServiceIds = uniqueIds(input.serviceIds);
  if (uniqueServiceIds.length < 2) {
    throw new AppError("Bundle requires at least 2 services", 400, "VALIDATION_ERROR");
  }

  await ensureServicesBelongToMaster(masterId, uniqueServiceIds);

  const last = await prisma.servicePackage.findFirst({
    where: { masterId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const pkg = await tx.servicePackage.create({
      data: {
        masterId,
        name: trimmedName,
        discountType: input.discountType,
        discountValue: Math.max(0, Math.floor(input.discountValue)),
        isEnabled: input.isEnabled ?? true,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    await tx.servicePackageItem.createMany({
      data: uniqueServiceIds.map((serviceId) => ({ packageId: pkg.id, serviceId })),
    });
    return pkg;
  });

  return { id: created.id };
}

export async function updateMasterPackage(
  masterId: string,
  packageId: string,
  input: UpdateMasterPackageInput
): Promise<{ id: string }> {
  const pkg = await prisma.servicePackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      masterId: true,
      items: { select: { serviceId: true } },
    },
  });
  if (!pkg || pkg.masterId !== masterId) {
    throw new AppError("Package not found", 404, "NOT_FOUND");
  }

  const data: Prisma.ServicePackageUpdateInput = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new AppError("Name is required", 400, "VALIDATION_ERROR");
    data.name = trimmed;
  }
  if (input.discountType !== undefined) data.discountType = input.discountType;
  if (input.discountValue !== undefined) {
    data.discountValue = Math.max(0, Math.floor(input.discountValue));
  }
  if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;

  const desiredServiceIds = Array.isArray(input.serviceIds)
    ? uniqueIds(input.serviceIds)
    : null;
  if (desiredServiceIds !== null) {
    if (desiredServiceIds.length < 2) {
      throw new AppError("Bundle requires at least 2 services", 400, "VALIDATION_ERROR");
    }
    await ensureServicesBelongToMaster(masterId, desiredServiceIds);
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.servicePackage.update({ where: { id: packageId }, data });
    }
    if (desiredServiceIds) {
      const existing = pkg.items.map((row) => row.serviceId);
      const toRemove = existing.filter((id) => !desiredServiceIds.includes(id));
      const toAdd = desiredServiceIds.filter((id) => !existing.includes(id));
      if (toRemove.length > 0) {
        await tx.servicePackageItem.deleteMany({
          where: { packageId, serviceId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.servicePackageItem.createMany({
          data: toAdd.map((serviceId) => ({ packageId, serviceId })),
        });
      }
    }
  });

  return { id: packageId };
}

export async function deleteMasterPackage(
  masterId: string,
  packageId: string
): Promise<{ id: string; deleted: true }> {
  const pkg = await prisma.servicePackage.findUnique({
    where: { id: packageId },
    select: { id: true, masterId: true },
  });
  if (!pkg || pkg.masterId !== masterId) {
    throw new AppError("Package not found", 404, "NOT_FOUND");
  }
  await prisma.servicePackage.delete({ where: { id: packageId } });
  return { id: packageId, deleted: true };
}

async function ensureServicesBelongToMaster(masterId: string, serviceIds: string[]): Promise<void> {
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, providerId: masterId },
    select: { id: true },
  });
  if (services.length !== serviceIds.length) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }
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

export const __test = { FIELD_LIST };
export type { ServiceUpdateField };

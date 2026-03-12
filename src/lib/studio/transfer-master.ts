import { MembershipStatus, Prisma, ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prismaDirect } from "@/lib/prisma-direct";

function uniqueStringIds(input: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of input) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export async function transferMasterOutOfStudio(
  masterId: string,
  studioProviderId: string,
  transferServices: boolean
): Promise<{ transferredServices: number }> {
  return prismaDirect.$transaction(
    async (tx) => {
      const master = await tx.provider.findUnique({
        where: { id: masterId },
        select: {
          id: true,
          type: true,
          studioId: true,
          ownerUserId: true,
        },
      });
      if (!master || master.type !== ProviderType.MASTER || master.studioId !== studioProviderId) {
        throw new AppError("Master not found in studio", 404, "NOT_FOUND");
      }

      const studio = await tx.studio.findUnique({
        where: { providerId: studioProviderId },
        select: { id: true },
      });
      if (!studio) {
        throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
      }

      const masterServices = await tx.masterService.findMany({
        where: { masterProviderId: masterId, studioId: studio.id },
        select: {
          id: true,
          isEnabled: true,
          priceOverride: true,
          durationOverrideMin: true,
          serviceId: true,
          service: {
            select: {
              id: true,
              title: true,
              name: true,
              price: true,
              basePrice: true,
              durationMin: true,
              baseDurationMin: true,
              globalCategoryId: true,
              sortOrder: true,
            },
          },
        },
      });

      let transferredServices = 0;
      const targetServiceIdByMasterServiceId = new Map<string, string | null>();
      const categoryUsageIncrement = new Map<string, number>();

      let nextSortOrder =
        ((await tx.service.findFirst({
          where: { providerId: masterId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        }))?.sortOrder ?? -1) + 1;

      for (const masterService of masterServices) {
        if (!transferServices) {
          targetServiceIdByMasterServiceId.set(masterService.id, null);
          continue;
        }

        const service = masterService.service;
        const normalizedTitle = service.title?.trim() || service.name.trim();
        const normalizedName = service.name.trim() || normalizedTitle;

        const existing = await tx.service.findFirst({
          where: {
            providerId: masterId,
            OR: [
              { title: { equals: normalizedTitle, mode: "insensitive" } },
              { name: { equals: normalizedName, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        if (existing) {
          targetServiceIdByMasterServiceId.set(masterService.id, existing.id);
          continue;
        }

        const effectivePrice = masterService.priceOverride ?? service.basePrice ?? service.price;
        const effectiveDurationMin =
          masterService.durationOverrideMin ?? service.baseDurationMin ?? service.durationMin;

        const created = await tx.service.create({
          data: {
            providerId: masterId,
            title: normalizedTitle,
            name: normalizedName,
            price: effectivePrice,
            durationMin: effectiveDurationMin,
            globalCategoryId: service.globalCategoryId ?? null,
            isEnabled: masterService.isEnabled,
            isActive: true,
            onlinePaymentEnabled: false,
            sortOrder: nextSortOrder++,
          },
          select: { id: true, globalCategoryId: true },
        });

        targetServiceIdByMasterServiceId.set(masterService.id, created.id);
        transferredServices += 1;

        if (created.globalCategoryId) {
          categoryUsageIncrement.set(
            created.globalCategoryId,
            (categoryUsageIncrement.get(created.globalCategoryId) ?? 0) + 1
          );
        }
      }

      const masterServiceIds = masterServices.map((item) => item.id);
      if (masterServiceIds.length > 0) {
        const offers = await tx.modelOffer.findMany({
          where: { masterId, masterServiceId: { in: masterServiceIds } },
          select: { id: true, masterServiceId: true, serviceIds: true },
        });

        for (const offer of offers) {
          if (!offer.masterServiceId) continue;
          const targetServiceId = targetServiceIdByMasterServiceId.get(offer.masterServiceId) ?? null;
          await tx.modelOffer.update({
            where: { id: offer.id },
            data: {
              masterServiceId: null,
              serviceId: targetServiceId,
              serviceIds: targetServiceId
                ? uniqueStringIds([...(offer.serviceIds ?? []), targetServiceId])
                : uniqueStringIds(offer.serviceIds ?? []),
              ...(targetServiceId ? {} : { status: "ARCHIVED" }),
            },
          });
        }
      }

      if (categoryUsageIncrement.size > 0) {
        for (const [categoryId, increment] of categoryUsageIncrement) {
          await tx.globalCategory.update({
            where: { id: categoryId },
            data: { usageCount: { increment } },
          });
        }
      }

      await tx.masterService.deleteMany({
        where: { masterProviderId: masterId, studioId: studio.id },
      });

      if (master.ownerUserId) {
        await tx.studioMembership.updateMany({
          where: {
            userId: master.ownerUserId,
            studioId: studio.id,
            status: { not: MembershipStatus.LEFT },
          },
          data: {
            status: MembershipStatus.LEFT,
            leftAt: new Date(),
          },
        });
      }

      await tx.provider.update({
        where: { id: masterId },
        data: { studioId: null },
      });

      return { transferredServices };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}


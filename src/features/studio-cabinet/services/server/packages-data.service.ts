import { DiscountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * STUDIO-PACKAGES-A: strict mirror of master ServicePackage pattern.
 *
 * `ServicePackage` schema is scoped via a `masterId String` FK to
 * `Provider`. Despite the field name, it is a generic Provider FK with
 * no `Provider.type` constraint at DB level — Studios (which have
 * their own `providerId`) reuse the same model. Studio packages live
 * under `masterId === studio.providerId`. Naming inconsistency is
 * acknowledged as a follow-up rename in BACKLOG.
 *
 * Final pricing is computed on the fly from items' Service.price using
 * the same `computeBundlePricing` formula as master:
 *   - PERCENT: round(totalPrice × value / 100)
 *   - FIXED: min(totalPrice, value)   (value in kopeks)
 *   - finalPrice = max(0, totalPrice − discountAmount)
 */

export type StudioPackageServiceComponent = {
  serviceId: string;
  name: string;
  priceKopeks: number;
  durationMin: number;
  /**
   * Услуга доступна для записи: `isEnabled && isActive`. Студия выключает
   * услугу через `isActive` («на паузе»), и запись на пакет такую услугу
   * отвергает (`package-booking.ts`) — MOBILE-STUDIO-C, G5.
   */
  isEnabled: boolean;
};

export type StudioPackageView = {
  id: string;
  name: string;
  isEnabled: boolean;
  discountType: DiscountType;
  discountValue: number;
  totalPrice: number;
  discountAmount: number;
  finalPrice: number;
  totalDurationMin: number;
  components: StudioPackageServiceComponent[];
  /** True when any included service is disabled — UI shows warning. */
  hasDisabledComponent: boolean;
};

export type StudioPackagePickerService = {
  id: string;
  name: string;
  priceKopeks: number;
  durationMin: number;
  isEnabled: boolean;
};

function computePricing(input: {
  components: Array<{ priceKopeks: number; durationMin: number }>;
  discountType: DiscountType;
  discountValue: number;
}) {
  const totalPrice = input.components.reduce(
    (sum, item) => sum + item.priceKopeks,
    0,
  );
  const totalDurationMin = input.components.reduce(
    (sum, item) => sum + item.durationMin,
    0,
  );
  const value = Math.max(0, Math.floor(input.discountValue));
  const discountAmount =
    input.discountType === DiscountType.PERCENT
      ? Math.round((totalPrice * value) / 100)
      : Math.min(totalPrice, value);
  const finalPrice = Math.max(0, totalPrice - discountAmount);
  return { totalPrice, totalDurationMin, discountAmount, finalPrice };
}

export async function loadStudioPackages(
  studioId: string,
): Promise<StudioPackageView[]> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { providerId: true },
  });
  if (!studio) return [];

  const packages = await prisma.servicePackage.findMany({
    where: { masterId: studio.providerId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      items: {
        include: {
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              price: true,
              basePrice: true,
              durationMin: true,
              baseDurationMin: true,
              isEnabled: true,
              isActive: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  return packages.map<StudioPackageView>((pkg) => {
    const sortedItems = [...pkg.items].sort(
      (a, b) => a.service.sortOrder - b.service.sortOrder,
    );
    const components: StudioPackageServiceComponent[] = sortedItems.map(
      (item) => ({
        serviceId: item.service.id,
        name: item.service.title?.trim() || item.service.name,
        priceKopeks: item.service.basePrice ?? item.service.price,
        durationMin: item.service.baseDurationMin ?? item.service.durationMin,
        isEnabled: item.service.isEnabled && item.service.isActive,
      }),
    );
    const pricing = computePricing({
      components,
      discountType: pkg.discountType,
      discountValue: pkg.discountValue,
    });

    return {
      id: pkg.id,
      name: pkg.name,
      isEnabled: pkg.isEnabled,
      discountType: pkg.discountType,
      discountValue: pkg.discountValue,
      totalPrice: pricing.totalPrice,
      discountAmount: pricing.discountAmount,
      finalPrice: pricing.finalPrice,
      totalDurationMin: pricing.totalDurationMin,
      components,
      hasDisabledComponent: components.some((c) => !c.isEnabled),
    };
  });
}

export async function loadStudioPackagePickerServices(
  studioId: string,
): Promise<StudioPackagePickerService[]> {
  const services = await prisma.service.findMany({
    where: { studioId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      title: true,
      price: true,
      basePrice: true,
      durationMin: true,
      baseDurationMin: true,
      isEnabled: true,
      isActive: true,
    },
  });
  return services.map((s) => ({
    id: s.id,
    name: s.title?.trim() || s.name,
    priceKopeks: s.basePrice ?? s.price,
    durationMin: s.baseDurationMin ?? s.durationMin,
    isEnabled: s.isEnabled && s.isActive,
  }));
}

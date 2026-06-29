import { cache } from "react";
import { DiscountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * PACKAGE-BOOKING-MVP-2 — read-only bundle catalog for the public STUDIO
 * profile (closes R2-04-PKG: studio packages were never surfaced). Mirrors the
 * solo `getMasterPublicProfileView` bundle transformation, but `masterId` here
 * is the STUDIO's provider id, and the per-component price/duration shown on
 * the card are INDICATIVE (catalog base) — the authoritative per-master price
 * comes from the chosen master's override at propose/create time (studio
 * packages let the client pick a master per component).
 */

export type StudioBundleComponent = {
  serviceId: string;
  name: string;
  /** Indicative catalog base price (kopeks); per-master override applies at booking. */
  basePrice: number;
  baseDurationMin: number;
  sortOrder: number;
};

export type StudioBundleView = {
  id: string;
  name: string;
  serviceNames: string[];
  components: StudioBundleComponent[];
  totalDurationMin: number;
  totalPrice: number;
  finalPrice: number;
  discountAmount: number;
};

export const getStudioBundles = cache(
  async (studioProviderId: string): Promise<StudioBundleView[]> => {
    if (!studioProviderId) return [];

    const packages = await prisma.servicePackage.findMany({
      where: { masterId: studioProviderId, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        discountType: true,
        discountValue: true,
        items: {
          select: {
            serviceId: true,
            sortOrder: true,
            service: {
              select: {
                id: true,
                name: true,
                title: true,
                durationMin: true,
                baseDurationMin: true,
                price: true,
                basePrice: true,
                isEnabled: true,
                isActive: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    });

    const views: StudioBundleView[] = [];
    for (const pkg of packages) {
      // Order by the package's own item.sortOrder so the displayed sequence ==
      // the booked sequential placement order.
      const items = [...pkg.items].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.service.sortOrder - b.service.sortOrder,
      );
      const enabledItems = items.filter((item) => item.service.isEnabled && item.service.isActive);
      // Drop packages whose components dropped below the bookable minimum (a
      // disabled/inactive service) — they can't be booked atomically.
      if (enabledItems.length !== items.length || enabledItems.length < 2) continue;

      const components: StudioBundleComponent[] = enabledItems.map((item) => ({
        serviceId: item.serviceId,
        name: item.service.title?.trim() || item.service.name,
        basePrice: item.service.basePrice ?? item.service.price,
        baseDurationMin: item.service.baseDurationMin ?? item.service.durationMin,
        sortOrder: item.sortOrder,
      }));
      const totalPrice = components.reduce((sum, c) => sum + c.basePrice, 0);
      const totalDurationMin = components.reduce((sum, c) => sum + c.baseDurationMin, 0);
      const discountAmount =
        pkg.discountType === DiscountType.PERCENT
          ? Math.round((totalPrice * pkg.discountValue) / 100)
          : Math.min(totalPrice, pkg.discountValue);
      const finalPrice = Math.max(0, totalPrice - discountAmount);

      views.push({
        id: pkg.id,
        name: pkg.name,
        serviceNames: components.map((c) => c.name),
        components,
        totalDurationMin,
        totalPrice,
        finalPrice,
        discountAmount,
      });
    }
    return views;
  },
);

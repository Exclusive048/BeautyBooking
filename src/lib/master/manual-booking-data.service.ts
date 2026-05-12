import { cache } from "react";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DashboardServiceLite } from "@/lib/master/dashboard.service";

/**
 * Lightweight per-request fetcher for the manual-booking modal data
 * (fix-01 modal positioning).
 *
 * The modal lives in `master cabinet layout` so it's available on
 * every route, not just `/cabinet/master/dashboard`. To avoid pulling
 * the full dashboard payload (KPIs, attention, today bookings) in the
 * layout, this helper returns ONLY what the modal needs:
 *   - the master's enabled services
 *   - whether the master is a solo (true) or studio member (false)
 *
 * Wrapped in React `cache()` so concurrent callsites in the same
 * request reuse the result (e.g., if dashboard page also asks).
 */

export type ManualBookingData = {
  services: DashboardServiceLite[];
  isSolo: boolean;
};

export const getMasterManualBookingData = cache(
  async (userId: string): Promise<ManualBookingData | null> => {
    const master = await prisma.provider.findFirst({
      where: { ownerUserId: userId, type: ProviderType.MASTER },
      select: { id: true, studioId: true },
      orderBy: { createdAt: "asc" },
    });
    if (!master) return null;

    const servicesRaw = await prisma.service.findMany({
      where: { providerId: master.id, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
      },
    });

    const services: DashboardServiceLite[] = servicesRaw.map((s) => ({
      id: s.id,
      title: s.title?.trim() || s.name,
      durationMin: s.durationMin,
      price: s.price,
    }));

    return {
      services,
      isSolo: master.studioId === null,
    };
  },
);

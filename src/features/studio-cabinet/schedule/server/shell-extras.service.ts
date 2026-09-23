import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import type { ScheduleMasterColumn } from "./types";

/**
 * STUDIO-CLIENT-WRITE-DIALOG-A — extracted from the inline
 * `loadShellExtras` in `cabinet/studio/bookings/page.tsx` so the
 * `CreateBookingDialog` can be opened from any studio cabinet
 * surface (bookings table, clients table, future surfaces) with
 * the same `scheduleMasters` + `services` shape.
 *
 * Single source of truth for the master-services join that the
 * dialog's pickers need:
 *   - `scheduleMasters[].serviceIds[]` — drives the master picker's
 *     incompatible-master gating (STUDIO-RESCHEDULE-VALIDATION-A
 *     pattern: option stays visible but `disabled` + suffix label).
 *   - `services[].masterIds[]` — drives the dialog's service-select
 *     filter when the master is pre-selected.
 *
 * Pure read — no mutations, no notifications, safe to call from any
 * studio cabinet route.
 */

export type StudioCabinetServiceOption = {
  id: string;
  name: string;
  durationMin: number;
  priceKopeks: number;
  masterIds: string[];
};

export type StudioCabinetShellExtras = {
  scheduleMasters: ScheduleMasterColumn[];
  services: StudioCabinetServiceOption[];
};

export async function loadStudioCabinetShellExtras(
  studioId: string,
): Promise<StudioCabinetShellExtras> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) return { scheduleMasters: [], services: [] };

  const [masters, services, masterServices] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: studio.providerId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        studioPaused: true,
        ownerUserId: true,
        ratingAvg: true,
        ratingCount: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { studioId, isEnabled: true },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.masterService.findMany({
      where: {
        isEnabled: true,
        masterProvider: { type: ProviderType.MASTER, studioId: studio.providerId },
      },
      select: { masterProviderId: true, serviceId: true },
    }),
  ]);

  const mastersByService = new Map<string, string[]>();
  // STUDIO-RESCHEDULE-VALIDATION-A: invert the same join so each
  // master row carries `serviceIds[]`. Dialog picker reads this to
  // mark incompatible masters as disabled.
  const servicesByMaster = new Map<string, string[]>();
  for (const link of masterServices) {
    const byService = mastersByService.get(link.serviceId) ?? [];
    byService.push(link.masterProviderId);
    mastersByService.set(link.serviceId, byService);

    const byMaster = servicesByMaster.get(link.masterProviderId) ?? [];
    byMaster.push(link.serviceId);
    servicesByMaster.set(link.masterProviderId, byMaster);
  }

  return {
    scheduleMasters: masters.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      rating: m.ratingAvg ?? 0,
      reviewsCount: m.ratingCount ?? 0,
      isAvailable: isStudioMasterActive(m),
      serviceIds: servicesByMaster.get(m.id) ?? [],
    })),
    services: services.map((s) => ({
      id: s.id,
      name: s.title?.trim() || s.name,
      durationMin: s.durationMin,
      priceKopeks: s.price,
      masterIds: mastersByService.get(s.id) ?? [],
    })),
  };
}

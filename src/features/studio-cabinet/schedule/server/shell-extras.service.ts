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
  /** Базовые длительность и цена услуги (`baseDurationMin ?? durationMin`, `basePrice ?? price`). */
  durationMin: number;
  priceKopeks: number;
  masterIds: string[];
  /**
   * MOBILE-STUDIO-C (ops): что запишет `createStudioBooking` у каждого мастера —
   * его длительность и цена (`durationOverrideMin` / `priceOverride`), иначе базовые.
   */
  masterOffers: Array<{ masterId: string; durationMin: number; priceKopeks: number }>;
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
      // MOBILE-STUDIO-C (ops): архивная услуга (`isActive: false`) не
      // записывается (`createStudioBooking` → «Услуга не найдена.»).
      where: { studioId, isEnabled: true, isActive: true },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
        baseDurationMin: true,
        basePrice: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.masterService.findMany({
      where: {
        isEnabled: true,
        masterProvider: { type: ProviderType.MASTER, studioId: studio.providerId },
      },
      select: { masterProviderId: true, serviceId: true, priceOverride: true, durationOverrideMin: true },
    }),
  ]);
  const linksByService = new Map<string, typeof masterServices>();
  for (const link of masterServices) {
    const links = linksByService.get(link.serviceId) ?? [];
    links.push(link);
    linksByService.set(link.serviceId, links);
  }

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
    services: services.map((s) => {
      const durationMin = s.baseDurationMin ?? s.durationMin;
      const priceKopeks = s.basePrice ?? s.price;
      return {
        id: s.id,
        name: s.title?.trim() || s.name,
        durationMin,
        priceKopeks,
        masterIds: mastersByService.get(s.id) ?? [],
        masterOffers: (linksByService.get(s.id) ?? []).map((link) => ({
          masterId: link.masterProviderId,
          durationMin: link.durationOverrideMin ?? durationMin,
          priceKopeks: link.priceOverride ?? priceKopeks,
        })),
      };
    }),
  };
}

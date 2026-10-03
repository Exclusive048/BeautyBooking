import { cache } from "react";
import { DiscountType, ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { prisma } from "@/lib/prisma";
import { canonicalPublicProviderKey } from "@/lib/providers/resolve-public-provider";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { ACTIVE_STUDIO_PROFILE_SELECT, pickActiveStudioProfile } from "@/lib/providers/studio-profile";

/**
 * Каталоги пакетов услуг для публичных поверхностей.
 *
 * - `listSoloMasterBundles` — пакеты соло-мастера (бывшее тело
 *   `getMasterPublicProfileView().bundles`, вынесено без изменений: страница
 *   `/u/{username}` получает ровно тот же массив).
 * - `getStudioBundles` — пакеты студии (переехал из
 *   `features/public-studio/server/studio-packages.service.ts`, чтобы его мог
 *   импортировать JSON-роут).
 * - `getPublicProviderPackages` — MOBILE-B3, тело
 *   `GET /api/public/providers/{key}/packages`.
 */

export type PublicBundleView = {
  // PACKAGE-BOOKING-MVP-1: the bundle is now bookable, so the package `id` +
  // component `serviceId`s are exposed (booking-flow carve-out to Rule 12,
  // same as providerId/serviceId in the single-booking widget).
  id: string;
  name: string;
  serviceNames: string[];
  /** Components in package `sortOrder` — the sequence the booking places them in. */
  components: Array<{ serviceId: string; name: string; price: number; durationMin: number }>;
  totalDurationMin: number;
  totalPrice: number;
  finalPrice: number;
  discountAmount: number;
  discountType: DiscountType;
  discountValue: number;
};

/**
 * Read-only bundle catalog of a solo master (31c). Bundles with a disabled
 * component are hidden.
 */
export async function listSoloMasterBundles(masterProviderId: string): Promise<PublicBundleView[]> {
  const packages = await prisma.servicePackage.findMany({
    where: { masterId: masterProviderId, isEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    // Rule 12: explicit select. PACKAGE-BOOKING-MVP-1 — the package `id`
    // and component `serviceId`s are now exposed because the bundle is
    // bookable; this is the accepted booking-flow carve-out (same as
    // providerId/serviceId already used by /api/public/bookings —
    // RULE-12-BOOKING-CONTRACT-OPTIONAL). Still never expose masterId /
    // timestamps.
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
              price: true,
              isEnabled: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  return packages
    .map((pkg) => {
      // PACKAGE-BOOKING-MVP-1: order by the package's own item.sortOrder so
      // the displayed sequence == the booked sequential placement order.
      const items = [...pkg.items].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.service.sortOrder - b.service.sortOrder,
      );
      const totalPrice = items.reduce((sum, item) => sum + item.service.price, 0);
      const totalDurationMin = items.reduce((sum, item) => sum + item.service.durationMin, 0);
      const discountAmount =
        pkg.discountType === DiscountType.PERCENT
          ? Math.round((totalPrice * pkg.discountValue) / 100)
          : Math.min(totalPrice, pkg.discountValue);
      const finalPrice = Math.max(0, totalPrice - discountAmount);
      const serviceNames = items.map((item) => item.service.title?.trim() || item.service.name);
      const components = items.map((item) => ({
        serviceId: item.serviceId,
        name: item.service.title?.trim() || item.service.name,
        price: item.service.price,
        durationMin: item.service.durationMin,
      }));
      const hasDisabledComponent = items.some((item) => !item.service.isEnabled);
      return {
        id: pkg.id,
        name: pkg.name,
        serviceNames,
        components,
        totalDurationMin,
        totalPrice,
        finalPrice,
        discountAmount,
        discountType: pkg.discountType,
        discountValue: pkg.discountValue,
        hasDisabledComponent,
      };
    })
    .filter((bundle) => !bundle.hasDisabledComponent)
    .map((bundle): PublicBundleView => ({
      id: bundle.id,
      name: bundle.name,
      serviceNames: bundle.serviceNames,
      components: bundle.components,
      totalDurationMin: bundle.totalDurationMin,
      totalPrice: bundle.totalPrice,
      finalPrice: bundle.finalPrice,
      discountAmount: bundle.discountAmount,
      discountType: bundle.discountType,
      discountValue: bundle.discountValue,
    }));
}

/**
 * PACKAGE-BOOKING-MVP-2 — read-only bundle catalog for the public STUDIO
 * profile (closes R2-04-PKG: studio packages were never surfaced). Mirrors the
 * solo bundle transformation above, but `masterId` here is the STUDIO's
 * provider id, and the per-component price/duration shown on the card are
 * INDICATIVE (catalog base) — the authoritative per-master price comes from the
 * chosen master's override at propose/create time (studio packages let the
 * client pick a master per component).
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

/** MOBILE-B3 — пакет в JSON для приложения (общая форма соло и студии). */
export type PublicPackageDto = {
  // Rule 12, booking-flow carve-out (PACKAGE-BOOKING-MVP-1): `id` — CUID
  // `ServicePackage` для `/api/public/packages/{id}/…`, `serviceId` — CUID
  // услуги для `/slots` / `/availability` и тела propose/book.
  id: string;
  name: string;
  serviceNames: string[];
  /** В порядке пакета (`sortOrder`) — в этом порядке их и записывают. */
  components: Array<{ serviceId: string; name: string; price: number; durationMin: number }>;
  totalDurationMin: number;
  /** Копейки. */
  totalPrice: number;
  finalPrice: number;
  discountAmount: number;
};

export type PublicProviderPackages = {
  /**
   * `solo` — пакеты соло-мастера (`/api/public/packages/{id}/{propose,book}`);
   * `studio` — пакеты студии (`…/studio/{propose,book}`, мастер на каждую
   * услугу); `none` — пакетов на этой странице не продают (мастер студии и т. п.).
   */
  kind: "solo" | "studio" | "none";
  /**
   * `solo`: перерыв мастера между записями (минуты, нормализован как в ядре
   * записи) — следующую услугу пакета можно ставить не раньше
   * `конец предыдущей + bufferMin`. `studio` / `none`: 0 (у студии буфер — у
   * каждого мастера, `GET /api/providers/{key}/masters`).
   */
  bufferMin: number;
  packages: PublicPackageDto[];
};

/**
 * MOBILE-B3 — каталог пакетов провайдера для приложения: то, что веб показывает
 * с кнопкой «Записаться на пакет».
 *
 * - Соло-мастер: тот же каталог, что `/u/{username}` (`listSoloMasterBundles`).
 *   «Соло» = мастер без студии и в данных (`studioId`), и по профилю в студии
 *   (`pickActiveStudioProfile`): веб показывает кнопку пакета только при
 *   `!provider.studioId`, а ядро записи пакета (`loadPackageForBooking`)
 *   принимает только мастера без `studioId`. Пересечение двух правил — ровно те
 *   пакеты, на которые запись пройдёт.
 * - Студия: `getStudioBundles` (цены и длительности — базовые, у мастера могут
 *   быть свои; точную цену даёт `studio/propose`).
 * - Остальное (мастер в студии) — пустой список: его пакеты на личной странице
 *   не продаются.
 *
 * Не найден или не опубликован — 404 `PROVIDER_NOT_FOUND`.
 */
export async function getPublicProviderPackages(providerKey: string): Promise<PublicProviderPackages> {
  const provider = await resolveProviderBySlugOrId({
    key: await canonicalPublicProviderKey(providerKey),
    select: {
      id: true,
      type: true,
      studioId: true,
      bufferBetweenBookingsMin: true,
      ...ACTIVE_STUDIO_PROFILE_SELECT,
    },
    requirePublished: true,
  });
  if (!provider) {
    throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  if (provider.type === ProviderType.STUDIO) {
    const bundles = await getStudioBundles(provider.id);
    return {
      kind: "studio",
      bufferMin: 0,
      packages: bundles.map((bundle) => ({
        id: bundle.id,
        name: bundle.name,
        serviceNames: bundle.serviceNames,
        components: bundle.components.map((component) => ({
          serviceId: component.serviceId,
          name: component.name,
          price: component.basePrice,
          durationMin: component.baseDurationMin,
        })),
        totalDurationMin: bundle.totalDurationMin,
        totalPrice: bundle.totalPrice,
        finalPrice: bundle.finalPrice,
        discountAmount: bundle.discountAmount,
      })),
    };
  }

  if (provider.type !== ProviderType.MASTER || provider.studioId || pickActiveStudioProfile(provider)) {
    return { kind: "none", bufferMin: 0, packages: [] };
  }

  const bundles = await listSoloMasterBundles(provider.id);
  return {
    kind: "solo",
    bufferMin: normalizeBufferMinutes(provider.bufferBetweenBookingsMin),
    packages: bundles.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      serviceNames: bundle.serviceNames,
      components: bundle.components,
      totalDurationMin: bundle.totalDurationMin,
      totalPrice: bundle.totalPrice,
      finalPrice: bundle.finalPrice,
      discountAmount: bundle.discountAmount,
    })),
  };
}

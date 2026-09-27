import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { Prisma, ProviderType } from "@prisma/client";
import type { HotSlotRuleInput } from "@/lib/hot-slots/schemas";

export type HotSlotServiceCandidate = {
  id: string;
  title: string;
  price: number;
  durationMin: number;
};

type ProviderForHotSlots = {
  id: string;
  type: ProviderType;
  studioId: string | null;
  timezone: string;
  priceFrom: number;
  name: string;
  publicUsername: string | null;
};

const DEFAULT_RULE = {
  isEnabled: false,
  triggerHours: 24,
  discountType: "PERCENT" as const,
  discountValue: 10,
  applyMode: "ALL_SERVICES" as const,
  minPriceFrom: null as number | null,
  serviceIds: [] as string[],
};

async function loadProvider(providerId: string): Promise<ProviderForHotSlots> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      type: true,
      studioId: true,
      timezone: true,
      priceFrom: true,
      name: true,
      publicUsername: true,
    },
  });
  if (!provider) {
    throw new AppError("Мастер не найден.", 404, "PROVIDER_NOT_FOUND");
  }
  return provider;
}

/**
 * STUDIO-MASTER-PROFILES (этап 2, решение владельца 2026-09-27): горящие окошки
 * профиля — по ЕГО услугам. Раньше у мастера студии они строились по студийным
 * услугам (`MasterService`) и вели на его личную страницу — то есть продавали
 * студийную услугу личной записью. Услуги профилей не смешиваются: у мастера
 * студии — свои услуги, у студии — её услуги.
 */
async function loadServicesForProvider(provider: ProviderForHotSlots): Promise<HotSlotServiceCandidate[]> {
  const services = await prisma.service.findMany({
    where: { providerId: provider.id, isActive: true, isEnabled: true },
    select: { id: true, name: true, title: true, durationMin: true, price: true },
  });
  return services.map((service) => ({
    id: service.id,
    title: service.title?.trim() || service.name,
    price: service.price,
    durationMin: service.durationMin,
  }));
}

export async function listHotSlotServices(providerId: string): Promise<HotSlotServiceCandidate[]> {
  const provider = await loadProvider(providerId);
  return loadServicesForProvider(provider);
}

export async function getOrCreateDiscountRule(providerId: string) {
  const existing = await prisma.discountRule.findUnique({ where: { providerId } });
  if (existing) return existing;

  try {
    return await prisma.discountRule.create({
      data: {
        providerId,
        ...DEFAULT_RULE,
      },
    });
  } catch (error) {
    // Race-safe: parallel requests may try to create the same rule одновременно.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.discountRule.findUnique({ where: { providerId } });
      if (retry) return retry;
    }
    throw error;
  }
}

export async function saveDiscountRule(providerId: string, input: HotSlotRuleInput) {
  const provider = await loadProvider(providerId);
  const services = await loadServicesForProvider(provider);
  if (input.applyMode === "MANUAL") {
    const availableIds = new Set(services.map((service) => service.id));
    const invalid = input.serviceIds.filter((id) => !availableIds.has(id));
    if (invalid.length > 0) {
      throw new AppError("Выберите доступные услуги.", 400, "VALIDATION_ERROR", {
        invalidServiceIds: invalid,
      });
    }
  }

  const next = await prisma.discountRule.upsert({
    where: { providerId },
    create: {
      providerId,
      isEnabled: input.isEnabled,
      smartPriceEnabled: input.smartPriceEnabled ?? false,
      triggerHours: input.triggerHours,
      discountType: input.discountType,
      discountValue: input.discountValue,
      applyMode: input.applyMode,
      minPriceFrom: input.minPriceFrom ?? null,
      serviceIds: input.serviceIds ?? [],
    },
    update: {
      isEnabled: input.isEnabled,
      smartPriceEnabled: input.smartPriceEnabled ?? false,
      triggerHours: input.triggerHours,
      discountType: input.discountType,
      discountValue: input.discountValue,
      applyMode: input.applyMode,
      minPriceFrom: input.minPriceFrom ?? null,
      serviceIds: input.serviceIds ?? [],
    },
  });

  return { rule: next, services };
}

export async function resolveProviderForHotSlots(providerId: string) {
  const provider = await loadProvider(providerId);
  const services = await loadServicesForProvider(provider);
  return { provider, services };
}

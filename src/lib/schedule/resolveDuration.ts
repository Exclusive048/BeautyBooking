import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";

type DurationResult =
  | { ok: true; data: number }
  | { ok: false; status: number; message: string; code: string };

export async function resolveServiceDuration(masterId: string, serviceId: string): Promise<DurationResult> {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, type: true, studioId: true },
  });
  if (!master || master.type !== ProviderType.MASTER) {
    return { ok: false, status: 404, message: "Мастер не найден.", code: "MASTER_NOT_FOUND" };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      providerId: true,
      durationMin: true,
      isEnabled: true,
      isActive: true,
    },
  });
  if (!service) {
    return { ok: false, status: 404, message: "Услуга не найдена.", code: "SERVICE_NOT_FOUND" };
  }
  if (!service.isEnabled || !service.isActive) {
    return { ok: false, status: 409, message: "Сервис временно недоступен. Попробуйте позже.", code: "SERVICE_DISABLED" };
  }

  if (master.studioId) {
    if (service.providerId !== master.studioId) {
      return { ok: false, status: 400, message: "Услуга не принадлежит студии.", code: "SERVICE_INVALID" };
    }

    const override = await prisma.masterService.findUnique({
      where: {
        masterProviderId_serviceId: {
          masterProviderId: master.id,
          serviceId: service.id,
        },
      },
      select: { durationOverrideMin: true, isEnabled: true },
    });

    if (!override || override.isEnabled === false) {
      return { ok: false, status: 409, message: "Услуга не назначена мастеру.", code: "SERVICE_INVALID" };
    }

    return { ok: true, data: override?.durationOverrideMin ?? service.durationMin };
  }

  if (service.providerId !== master.id) {
    return { ok: false, status: 400, message: "Услуга не принадлежит профилю.", code: "SERVICE_INVALID" };
  }

  return { ok: true, data: service.durationMin };
}

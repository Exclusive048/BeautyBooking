import { prisma } from "@/lib/prisma";
import { AppError, resolveErrorCode } from "@/lib/api/errors";
import { ProviderType, Prisma } from "@prisma/client";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { dateFromKey } from "@/lib/schedule/time";
import { toLocalDateKey, toUtcFromLocalDateTime } from "@/lib/schedule/timezone";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type BookingCoreContext = {
  provider: {
    id: string;
    type: ProviderType;
    ownerUserId: string | null;
    timezone: string;
    studioId: string | null;
    autoConfirmBookings: boolean;
    bufferBetweenBookingsMin: number;
  };
  service: {
    id: string;
    providerId: string;
    title: string | null;
    name: string;
    isEnabled: boolean;
    isActive: boolean;
    durationMin: number;
    baseDurationMin: number | null;
    price: number;
    basePrice: number | null;
    effectivePrice: number;
  };
  master: {
    id: string;
    type: ProviderType;
    studioId: string | null;
    timezone: string;
    bufferBetweenBookingsMin: number;
  } | null;
  resolvedMasterProviderId: string | null;
  durationMin: number;
  startAtUtc: Date;
  endAtUtc: Date;
  bufferMin: number;
  shouldAutoConfirm: boolean;
};

function parseSlotStartAtUtc(slotLabel: string, timezone: string): Date | null {
  const normalized = slotLabel.trim();
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = /^(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  if (!match) return null;

  const date = dateFromKey(match[1]);
  if (!date) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return toUtcFromLocalDateTime(date, hours, minutes, timezone);
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

export async function ensureNoConflicts(
  db: DbClient,
  input: {
    providerId: string;
    masterProviderId: string | null;
    startAtUtc: Date;
    endAtUtc: Date;
    bufferMin: number;
  }
): Promise<void> {
  const bufferedStart = input.bufferMin
    ? shiftMinutes(input.startAtUtc, -input.bufferMin)
    : input.startAtUtc;
  const bufferedEnd = input.bufferMin
    ? shiftMinutes(input.endAtUtc, input.bufferMin)
    : input.endAtUtc;

  const conflictWhere = input.masterProviderId
    ? { providerId: input.providerId, masterProviderId: input.masterProviderId }
    : { providerId: input.providerId };

  const conflicts = await db.booking.findMany({
    where: {
      ...conflictWhere,
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      startAtUtc: { not: null, lt: bufferedEnd },
      endAtUtc: { not: null, gt: bufferedStart },
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
    take: 1,
  });

  const conflict = conflicts.find((b) => {
    if (!b.startAtUtc || !b.endAtUtc) return false;
    const itemStart = input.bufferMin ? shiftMinutes(b.startAtUtc, -input.bufferMin) : b.startAtUtc;
    const itemEnd = input.bufferMin ? shiftMinutes(b.endAtUtc, input.bufferMin) : b.endAtUtc;
    return overlaps(input.startAtUtc, input.endAtUtc, itemStart, itemEnd);
  });

  if (conflict) {
    throw new AppError(
      "Слот уже занят. Обновите расписание и выберите другое время.",
      409,
      "SLOT_CONFLICT"
    );
  }
}

function mapAvailabilityError(code?: string): { message: string; status: number } {
  switch (code) {
    case "DURATION_INVALID":
      return { message: "Некорректная длительность услуги.", status: 400 };
    case "SERVICE_REQUIRED":
      return { message: "Не указана услуга.", status: 400 };
    case "DATE_INVALID":
      return { message: "Некорректная дата.", status: 400 };
    case "RANGE_INVALID":
      return { message: "Некорректный диапазон.", status: 400 };
    case "PROVIDER_NOT_FOUND":
    case "MASTER_NOT_FOUND":
      return { message: "Мастер не найден.", status: 404 };
    case "SERVICE_NOT_FOUND":
      return { message: "Услуга не найдена.", status: 404 };
    case "SERVICE_INVALID":
      return { message: "Услуга недоступна для мастера.", status: 409 };
    default:
      return { message: "Не удалось проверить доступность слота.", status: 500 };
  }
}

export async function resolveBookingCore(input: {
  providerId: string;
  serviceId: string;
  masterProviderId: string | null;
  clientUserId: string;
  startAtUtc?: Date;
  endAtUtc?: Date | null;
  slotLabel?: string;
}): Promise<BookingCoreContext> {
  const [provider, service] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: input.providerId },
      select: {
        id: true,
        type: true,
        ownerUserId: true,
        timezone: true,
        studioId: true,
        autoConfirmBookings: true,
        bufferBetweenBookingsMin: true,
      },
    }),
    prisma.service.findUnique({
      where: { id: input.serviceId },
      select: {
        id: true,
        providerId: true,
        title: true,
        name: true,
        isEnabled: true,
        isActive: true,
        durationMin: true,
        baseDurationMin: true,
        price: true,
        basePrice: true,
      },
    }),
  ]);

  if (!provider) {
    throw new AppError("Провайдер не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  if (!service) {
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
  }

  if (!service.isEnabled || !service.isActive) {
    throw new AppError("Service is not available", 400, "SERVICE_DISABLED");
  }

  if (provider.ownerUserId && provider.ownerUserId === input.clientUserId) {
    throw new AppError("Cannot book your own services", 400, "FORBIDDEN");
  }

  const providerServiceMismatch =
    provider.type === ProviderType.MASTER
      ? service.providerId !== provider.id && service.providerId !== provider.studioId
      : service.providerId !== provider.id;
  if (providerServiceMismatch) {
    throw new AppError("Услуга не принадлежит провайдеру.", 400, "SERVICE_NOT_BELONGS_TO_PROVIDER");
  }

  const resolvedMasterProviderId =
    provider.type === ProviderType.MASTER ? provider.id : input.masterProviderId ?? null;

  const master =
    resolvedMasterProviderId && resolvedMasterProviderId !== provider.id
      ? await prisma.provider.findUnique({
          where: { id: resolvedMasterProviderId },
          select: {
            id: true,
            type: true,
            studioId: true,
            timezone: true,
            bufferBetweenBookingsMin: true,
          },
        })
      : null;

  if (resolvedMasterProviderId && resolvedMasterProviderId !== provider.id && !master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  if (master && provider.type === ProviderType.STUDIO && master.studioId !== provider.id) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  const needsOverride = provider.type === ProviderType.STUDIO || provider.studioId;
  const override =
    resolvedMasterProviderId && needsOverride
      ? await prisma.masterService.findUnique({
          where: {
            masterProviderId_serviceId: {
              masterProviderId: resolvedMasterProviderId,
              serviceId: service.id,
            },
          },
          select: {
            isEnabled: true,
            priceOverride: true,
            durationOverrideMin: true,
          },
        })
      : null;

  if (resolvedMasterProviderId && needsOverride) {
    if (!override || override.isEnabled === false) {
      throw new AppError("Мастер не оказывает выбранную услугу.", 409, "SERVICE_INVALID");
    }
  }

  const durationMin = override?.durationOverrideMin ?? service.baseDurationMin ?? service.durationMin;
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    throw new AppError("Некорректная длительность услуги.", 400, "DURATION_INVALID");
  }

  const effectivePrice = override?.priceOverride ?? service.basePrice ?? service.price;
  if (!Number.isInteger(effectivePrice) || effectivePrice < 0) {
    throw new AppError("Service price is invalid.", 400, "VALIDATION_ERROR");
  }

  const startAtUtc =
    input.startAtUtc ??
    (input.slotLabel ? parseSlotStartAtUtc(input.slotLabel, provider.timezone) : null);
  if (!isValidDate(startAtUtc)) {
    throw new AppError("Некорректная дата начала.", 400, "DATE_INVALID");
  }

  const endAtUtc = input.endAtUtc ?? new Date(startAtUtc.getTime() + durationMin * 60 * 1000);
  if (!isValidDate(endAtUtc) || endAtUtc <= startAtUtc) {
    throw new AppError("Некорректная дата окончания.", 400, "DATE_INVALID");
  }

  const availabilityProviderId = resolvedMasterProviderId ?? provider.id;
  const availabilityTimezone = master?.timezone ?? provider.timezone;
  const availability = await listAvailabilitySlotsPaginated(
    availabilityProviderId,
    service.id,
    durationMin,
    {
      fromKey: toLocalDateKey(startAtUtc, availabilityTimezone),
      limit: 1,
    }
  );
  if (!availability.ok) {
    const mapped = mapAvailabilityError(availability.code);
    const code = resolveErrorCode(availability.code, "INTERNAL_ERROR");
    throw new AppError(mapped.message, mapped.status, code);
  }

  const hasSlot = availability.data.slots.some((slot) => {
    const slotStart = toDate(slot.startAtUtc);
    const slotEnd = toDate(slot.endAtUtc);
    if (!slotStart || !slotEnd) return false;
    return slotStart.getTime() === startAtUtc.getTime() && slotEnd.getTime() === endAtUtc.getTime();
  });
  if (!hasSlot) {
    throw new AppError(
      "Слот уже занят. Обновите расписание и выберите другое время.",
      409,
      "SLOT_CONFLICT"
    );
  }

  const bufferSource =
    resolvedMasterProviderId && resolvedMasterProviderId !== provider.id
      ? master?.bufferBetweenBookingsMin
      : provider.bufferBetweenBookingsMin;
  const bufferMin = normalizeBufferMinutes(bufferSource);

  const shouldAutoConfirm =
    provider.type === ProviderType.MASTER && !provider.studioId && provider.autoConfirmBookings;

  return {
    provider,
    service: {
      ...service,
      effectivePrice,
    },
    master,
    resolvedMasterProviderId,
    durationMin,
    startAtUtc,
    endAtUtc,
    bufferMin,
    shouldAutoConfirm,
  };
}

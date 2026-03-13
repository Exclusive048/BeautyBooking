import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import type { ServiceInput, ServiceRecord, ServiceUpdate } from "@/lib/domain/services";

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validateCreate(input: ServiceInput): Result<ServiceInput> {
  const name = input.name.trim();
  if (!name) return { ok: false, status: 400, message: "Service name is required", code: "NAME_REQUIRED" };
  if (!isPositiveInt(input.durationMin) || input.durationMin % 5 !== 0) {
    return { ok: false, status: 400, message: "Duration must be a positive multiple of 5", code: "DURATION_INVALID" };
  }
  if (!isPositiveInt(input.price)) {
    return { ok: false, status: 400, message: "Price must be a positive integer", code: "PRICE_INVALID" };
  }

  return { ok: true, data: { ...input, name } };
}

function validateUpdate(input: ServiceUpdate): Result<ServiceUpdate> {
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, status: 400, message: "Service name is required", code: "NAME_REQUIRED" };
    input = { ...input, name };
  }
  if (input.durationMin !== undefined) {
    if (!isPositiveInt(input.durationMin) || input.durationMin % 5 !== 0) {
      return { ok: false, status: 400, message: "Duration must be a positive multiple of 5", code: "DURATION_INVALID" };
    }
  }
  if (input.price !== undefined) {
    if (!isPositiveInt(input.price)) {
      return { ok: false, status: 400, message: "Price must be a positive integer", code: "PRICE_INVALID" };
    }
  }

  return { ok: true, data: input };
}

function toServiceRecord(service: {
  id: string;
  providerId: string;
  name: string;
  durationMin: number;
  price: number;
  isEnabled: boolean;
  onlinePaymentEnabled: boolean;
}): ServiceRecord {
  return {
    id: service.id,
    providerId: service.providerId,
    name: service.name,
    durationMin: service.durationMin,
    price: service.price,
    isEnabled: service.isEnabled,
    onlinePaymentEnabled: service.onlinePaymentEnabled,
  };
}

export async function listProviderServices(providerId: string): Promise<Result<ServiceRecord[]>> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };

  const services = await prisma.service.findMany({
    where: { providerId },
    orderBy: { createdAt: "asc" },
  });

  return { ok: true, data: services.map(toServiceRecord) };
}

export async function createProviderService(
  providerId: string,
  input: ServiceInput
): Promise<Result<ServiceRecord>> {
  const validated = validateCreate(input);
  if (!validated.ok) return validated;

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };

  const service = await prisma.service.create({
    data: { providerId, ...validated.data },
  });

  return { ok: true, data: toServiceRecord(service) };
}

export async function updateProviderService(
  providerId: string,
  serviceId: string,
  input: ServiceUpdate
): Promise<Result<ServiceRecord>> {
  const validated = validateUpdate(input);
  if (!validated.ok) return validated;

  const existing = await prisma.service.findFirst({
    where: { id: serviceId, providerId },
  });
  if (!existing) return { ok: false, status: 404, message: "Service not found", code: "SERVICE_NOT_FOUND" };

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: validated.data,
  });

  return { ok: true, data: toServiceRecord(service) };
}

export async function deleteProviderService(
  providerId: string,
  serviceId: string
): Promise<Result<{ id: string }>> {
  const existing = await prisma.service.findFirst({
    where: { id: serviceId, providerId },
    select: { id: true },
  });
  if (!existing) return { ok: false, status: 404, message: "Service not found", code: "SERVICE_NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.modelOffer.updateMany({
      where: {
        status: "ACTIVE",
        OR: [
          { serviceId },
          {
            masterService: {
              is: { serviceId },
            },
          },
        ],
      },
      data: { status: "ARCHIVED" },
    });

    await tx.service.delete({ where: { id: serviceId } });
  });

  return { ok: true, data: { id: serviceId } };
}

export async function setProviderServiceEnabled(
  providerId: string,
  serviceId: string,
  isEnabled: boolean
): Promise<Result<ServiceRecord>> {
  const existing = await prisma.service.findFirst({
    where: { id: serviceId, providerId },
  });
  if (!existing) return { ok: false, status: 404, message: "Service not found", code: "SERVICE_NOT_FOUND" };

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: { isEnabled },
  });

  return { ok: true, data: toServiceRecord(service) };
}

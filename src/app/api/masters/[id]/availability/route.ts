import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { listAvailabilitySlots } from "@/lib/schedule/usecases";

async function resolveDuration(masterId: string, serviceId: string) {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, type: true, studioId: true },
  });
  if (!master || master.type !== ProviderType.MASTER) {
    return { ok: false as const, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, providerId: true, durationMin: true },
  });
  if (!service) {
    return { ok: false as const, status: 404, message: "Service not found", code: "SERVICE_NOT_FOUND" };
  }

  if (master.studioId) {
    if (service.providerId !== master.studioId) {
      return { ok: false as const, status: 400, message: "Service not in studio", code: "SERVICE_INVALID" };
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

    if (override && override.isEnabled === false) {
      return { ok: false as const, status: 409, message: "Service disabled for master", code: "SERVICE_DISABLED" };
    }

    return { ok: true as const, data: override?.durationOverrideMin ?? service.durationMin };
  }

  if (service.providerId !== master.id) {
    return { ok: false as const, status: 400, message: "Service not in provider", code: "SERVICE_INVALID" };
  }

  return { ok: true as const, data: service.durationMin };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const p = params instanceof Promise ? await params : params;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const fromRaw = url.searchParams.get("from") ?? "";
  const toRaw = url.searchParams.get("to") ?? "";

  if (!serviceId) return fail("Service id is required", 400, "SERVICE_REQUIRED");

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail("Invalid date range", 400, "DATE_INVALID");
  }

  const duration = await resolveDuration(p.id, serviceId);
  if (!duration.ok) return fail(duration.message, duration.status, duration.code);

  const result = await listAvailabilitySlots(p.id, duration.data, { from, to });
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ slots: result.data });
}

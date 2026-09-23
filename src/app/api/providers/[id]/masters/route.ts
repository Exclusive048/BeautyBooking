import { ok, fail } from "@/lib/api/response";
import { normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { formatZodError } from "@/lib/api/validation";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { logError } from "@/lib/logging/logger";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const parsed = providerIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    const { id } = parsed.data;

    const provider = await resolveProviderBySlugOrId({
      key: id,
      select: {
        id: true,
        type: true,
        name: true,
        publicUsername: true,
        isPublished: true,
        bufferBetweenBookingsMin: true,
      },
    });

    if (!provider || !provider.isPublished) {
      return fail("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
    }

    if (provider.type === ProviderType.MASTER) {
      // EXP-024: include the master's own enabled service ids so consumers
      // (studio booking wizard) can list only masters who perform the
      // selected service. A solo master performs its own catalog services.
      const soloServices = await prisma.service.findMany({
        where: { providerId: provider.id, isEnabled: true },
        select: { id: true },
      });
      return ok({
        masters: [
          {
            id: provider.id,
            name: provider.name,
            publicUsername: provider.publicUsername,
            serviceIds: soloServices.map((s) => s.id),
            // PACKAGE-STUDIO-SAME-MASTER-BUFFER: normalized exactly as
            // resolveBookingCore will normalize it, so the wizard's cursor
            // and the create-side validator agree at the boundary.
            bufferMin: normalizeBufferMinutes(provider.bufferBetweenBookingsMin),
          },
        ],
      });
    }

    const masters = await prisma.provider.findMany({
      // STUDIO-PAUSE-SPLIT-01: команда студии — мастера, АКТИВНЫЕ в студии
      // (приглашение принято, не на паузе). Личная видимость мастера здесь не
      // решает: скрывший свою страницу продолжает работать в студии.
      where: { studioId: provider.id, type: ProviderType.MASTER, ...STUDIO_ACTIVE_MASTER_WHERE },
      // EXP-024: `masterServices` (enabled MasterService rows) is the source
      // of truth for which team master performs which service. The booking
      // wizard filters its picker on this — so it never lists (and never
      // fires `/availability` for → no 409 `SERVICE_INVALID`) masters who
      // aren't assigned to the chosen service.
      select: {
        id: true,
        name: true,
        publicUsername: true,
        isPublished: true,
        bufferBetweenBookingsMin: true,
        masterServices: {
          where: { isEnabled: true },
          select: { serviceId: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return ok({
      masters: masters.map((m) => ({
        id: m.id,
        name: m.name,
        // Ссылка на личную страницу — только если мастер её не скрыл: иначе
        // карточка команды вела бы на 404.
        publicUsername: m.isPublished ? m.publicUsername : null,
        serviceIds: m.masterServices.map((s) => s.serviceId),
        // PACKAGE-STUDIO-SAME-MASTER-BUFFER: the same normalization the
        // create-side `resolveBookingCore` applies — the package wizard's
        // same-master cursor must match the validator exactly.
        bufferMin: normalizeBufferMinutes(m.bufferBetweenBookingsMin),
      })),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    logError("GET /api/providers/[id]/masters failed", { error: detail });
    return fail("Не удалось загрузить мастеров. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}

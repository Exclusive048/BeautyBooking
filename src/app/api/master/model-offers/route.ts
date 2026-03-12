import { z } from "zod";
import { AccountType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterContext } from "@/lib/master/profile.service";
import { resolveMasterAccess } from "@/lib/model-offers/access";
import { createModelOfferSchema, normalizePrice, normalizeRequirements } from "@/lib/model-offers/schemas";
import { prisma } from "@/lib/prisma";
import { parseBody, parseQuery } from "@/lib/validation";
import { getRequestId, logError } from "@/lib/logging/logger";

const querySchema = z.object({
  masterId: z.string().trim().min(1).optional(),
});

export const runtime = "nodejs";

function canAccessMasterOffers(roles: AccountType[]): boolean {
  return roles.some((role) =>
    role === AccountType.MASTER || role === AccountType.STUDIO || role === AccountType.STUDIO_ADMIN
  );
}

function resolveServiceDuration(input: {
  durationOverrideMin: number | null;
  baseDurationMin: number | null;
  durationMin: number;
}): number {
  return input.durationOverrideMin ?? input.baseDurationMin ?? input.durationMin;
}

function toPriceNumber(value: Prisma.Decimal | null): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function uniqueStringIds(input: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of input) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!canAccessMasterOffers(user.roles)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const query = parseQuery(new URL(req.url), querySchema);
    const masterId = query.masterId
      ? (await resolveMasterAccess(query.masterId, user.id)).id
      : await getCurrentMasterProviderId(user.id);
    const context = await getMasterContext(masterId);

    if (context.isSolo) {
      const [offers, services] = await Promise.all([
        prisma.modelOffer.findMany({
          where: { masterId },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            masterId: true,
            dateLocal: true,
            timeRangeStartLocal: true,
            timeRangeEndLocal: true,
            serviceIds: true,
            price: true,
            requirements: true,
            extraBusyMin: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            master: { select: { id: true, name: true, avatarUrl: true } },
            masterService: {
              select: {
                id: true,
                durationOverrideMin: true,
                service: {
                  select: {
                    id: true,
                    name: true,
                    title: true,
                    durationMin: true,
                    baseDurationMin: true,
                    globalCategoryId: true,
                    globalCategory: { select: { id: true, name: true } },
                  },
                },
              },
            },
            service: {
              select: {
                id: true,
                name: true,
                title: true,
                durationMin: true,
                baseDurationMin: true,
                globalCategoryId: true,
                globalCategory: { select: { id: true, name: true } },
              },
            },
            _count: { select: { applications: true } },
          },
        }),
        prisma.service.findMany({
          where: {
            providerId: masterId,
            isEnabled: true,
            isActive: true,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            title: true,
            durationMin: true,
            price: true,
            globalCategoryId: true,
            globalCategory: { select: { id: true, name: true } },
          },
        }),
      ]);

      const serviceLookup = new Map(
        services.map((service) => [
          service.id,
          {
            id: service.id,
            title: service.title?.trim() || service.name,
            globalCategoryId: service.globalCategoryId ?? null,
            categoryTitle: service.globalCategory?.name ?? null,
            durationMin: service.durationMin,
            price: service.price,
          },
        ])
      );

      const offerItems = offers
        .map((offer) => {
          const primaryService = offer.service ?? offer.masterService?.service ?? null;
          if (!primaryService) return null;

          const primaryServiceId = primaryService.id;
          const primaryServiceFallback = {
            id: primaryServiceId,
            title: primaryService.title?.trim() || primaryService.name,
            globalCategoryId: primaryService.globalCategoryId ?? null,
            categoryTitle: primaryService.globalCategory?.name ?? null,
            durationMin: resolveServiceDuration({
              durationOverrideMin: offer.masterService?.durationOverrideMin ?? null,
              baseDurationMin: primaryService.baseDurationMin ?? null,
              durationMin: primaryService.durationMin,
            }),
            price: null,
          };
          const selectedServiceIds = uniqueStringIds([...(offer.serviceIds ?? []), primaryServiceId]);
          const selectedServices = selectedServiceIds
            .map((serviceId) =>
              serviceLookup.get(serviceId) ??
              (serviceId === primaryServiceId ? primaryServiceFallback : null)
            )
            .filter((service): service is NonNullable<typeof service> => Boolean(service));

          return {
            id: offer.id,
            masterId: offer.masterId,
            masterName: offer.master?.name ?? "Master",
            masterAvatarUrl: offer.master?.avatarUrl ?? null,
            masterServiceId: offer.service?.id ?? offer.masterService?.id ?? primaryServiceId,
            serviceId: primaryServiceId,
            serviceIds: selectedServiceIds,
            selectedServices,
            serviceTitle: primaryService.title?.trim() || primaryService.name,
            serviceCategory: primaryService.globalCategory?.name ?? null,
            durationMin: resolveServiceDuration({
              durationOverrideMin: offer.masterService?.durationOverrideMin ?? null,
              baseDurationMin: primaryService.baseDurationMin ?? null,
              durationMin: primaryService.durationMin,
            }),
            dateLocal: offer.dateLocal,
            timeRangeStartLocal: offer.timeRangeStartLocal,
            timeRangeEndLocal: offer.timeRangeEndLocal,
            price: toPriceNumber(offer.price),
            requirements: offer.requirements,
            extraBusyMin: offer.extraBusyMin,
            status: offer.status,
            applicationsCount: offer._count.applications,
            createdAt: offer.createdAt.toISOString(),
            updatedAt: offer.updatedAt.toISOString(),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const serviceItems = services.map((service) => ({
        id: service.id,
        serviceId: service.id,
        title: service.title?.trim() || service.name,
        globalCategoryId: service.globalCategoryId ?? null,
        categoryTitle: service.globalCategory?.name ?? null,
        price: service.price,
        durationMin: service.durationMin,
      }));

      return jsonOk({ offers: offerItems, services: serviceItems });
    }

    const [offers, services] = await Promise.all([
      prisma.modelOffer.findMany({
        where: {
          masterId,
          masterServiceId: { not: null },
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          masterId: true,
          dateLocal: true,
          timeRangeStartLocal: true,
          timeRangeEndLocal: true,
          serviceIds: true,
          price: true,
          requirements: true,
          extraBusyMin: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          master: { select: { id: true, name: true, avatarUrl: true } },
          masterService: {
            select: {
              id: true,
              durationOverrideMin: true,
              service: {
                select: {
                  id: true,
                  name: true,
                  title: true,
                  durationMin: true,
                  baseDurationMin: true,
                  globalCategoryId: true,
                  globalCategory: { select: { id: true, name: true } },
                },
              },
            },
          },
          _count: { select: { applications: true } },
        },
      }),
      prisma.masterService.findMany({
        where: {
          masterProviderId: masterId,
          isEnabled: true,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          durationOverrideMin: true,
          priceOverride: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              durationMin: true,
              baseDurationMin: true,
              price: true,
              basePrice: true,
              globalCategoryId: true,
              globalCategory: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const serviceLookup = new Map(
      services.map((item) => [
        item.service.id,
        {
          id: item.service.id,
          title: item.service.title?.trim() || item.service.name,
          globalCategoryId: item.service.globalCategoryId ?? null,
          categoryTitle: item.service.globalCategory?.name ?? null,
          durationMin: resolveServiceDuration({
            durationOverrideMin: item.durationOverrideMin ?? null,
            baseDurationMin: item.service.baseDurationMin ?? null,
            durationMin: item.service.durationMin,
          }),
          price: item.priceOverride ?? item.service.basePrice ?? item.service.price,
        },
      ])
    );

    const offerItems = offers
      .map((offer) => {
        if (!offer.masterService) return null;

        const primaryServiceId = offer.masterService.service.id;
        const primaryServiceFallback = {
          id: primaryServiceId,
          title: offer.masterService.service.title?.trim() || offer.masterService.service.name,
          globalCategoryId: offer.masterService.service.globalCategoryId ?? null,
          categoryTitle: offer.masterService.service.globalCategory?.name ?? null,
          durationMin: resolveServiceDuration({
            durationOverrideMin: offer.masterService.durationOverrideMin ?? null,
            baseDurationMin: offer.masterService.service.baseDurationMin ?? null,
            durationMin: offer.masterService.service.durationMin,
          }),
          price: null,
        };
        const selectedServiceIds = uniqueStringIds([...(offer.serviceIds ?? []), primaryServiceId]);
        const selectedServices = selectedServiceIds
          .map((serviceId) =>
            serviceLookup.get(serviceId) ??
            (serviceId === primaryServiceId ? primaryServiceFallback : null)
          )
          .filter((service): service is NonNullable<typeof service> => Boolean(service));

        return {
          id: offer.id,
          masterId: offer.masterId,
          masterName: offer.master?.name ?? "Master",
          masterAvatarUrl: offer.master?.avatarUrl ?? null,
          masterServiceId: offer.masterService.id,
          serviceId: offer.masterService.service.id,
          serviceIds: selectedServiceIds,
          selectedServices,
          serviceTitle: offer.masterService.service.title?.trim() || offer.masterService.service.name,
          serviceCategory: offer.masterService.service.globalCategory?.name ?? null,
          durationMin: resolveServiceDuration({
            durationOverrideMin: offer.masterService.durationOverrideMin ?? null,
            baseDurationMin: offer.masterService.service.baseDurationMin ?? null,
            durationMin: offer.masterService.service.durationMin,
          }),
          dateLocal: offer.dateLocal,
          timeRangeStartLocal: offer.timeRangeStartLocal,
          timeRangeEndLocal: offer.timeRangeEndLocal,
          price: toPriceNumber(offer.price),
          requirements: offer.requirements,
          extraBusyMin: offer.extraBusyMin,
          status: offer.status,
          applicationsCount: offer._count.applications,
          createdAt: offer.createdAt.toISOString(),
          updatedAt: offer.updatedAt.toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const serviceItems = services.map((item) => ({
      id: item.id,
      serviceId: item.service.id,
      title: item.service.title?.trim() || item.service.name,
      globalCategoryId: item.service.globalCategoryId ?? null,
      categoryTitle: item.service.globalCategory?.name ?? null,
      price: item.priceOverride ?? item.service.basePrice ?? item.service.price,
      durationMin: resolveServiceDuration({
        durationOverrideMin: item.durationOverrideMin ?? null,
        baseDurationMin: item.service.baseDurationMin ?? null,
        durationMin: item.service.durationMin,
      }),
    }));

    return jsonOk({ offers: offerItems, services: serviceItems });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/model-offers failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/model-offers",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!canAccessMasterOffers(user.roles)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const body = await parseBody(req, createModelOfferSchema);
    const requirements = normalizeRequirements(body.requirements);
    const priceValue = normalizePrice(body.price);

    const masterService = await prisma.masterService.findUnique({
      where: { id: body.masterServiceId },
      select: {
        id: true,
        isEnabled: true,
        masterProviderId: true,
        durationOverrideMin: true,
        priceOverride: true,
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
            globalCategoryId: true,
            globalCategory: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (masterService) {
      if (!masterService.isEnabled) {
        return jsonFail(404, "Service not found", "SERVICE_NOT_FOUND");
      }

      const master = await resolveMasterAccess(masterService.masterProviderId, user.id);
      const availableMasterServices = await prisma.masterService.findMany({
        where: {
          masterProviderId: master.id,
          isEnabled: true,
        },
        select: {
          serviceId: true,
          durationOverrideMin: true,
          priceOverride: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              durationMin: true,
              baseDurationMin: true,
              price: true,
              basePrice: true,
            },
          },
        },
      });
      const availableServiceIds = new Set(availableMasterServices.map((item) => item.serviceId));
      const requestedServiceIds = uniqueStringIds(body.serviceIds ?? []);
      const invalidServiceIds = requestedServiceIds.filter((serviceId) => !availableServiceIds.has(serviceId));
      if (invalidServiceIds.length > 0) {
        return jsonFail(404, "Service not found", "SERVICE_NOT_FOUND");
      }
      const selectedServiceIds = uniqueStringIds([...requestedServiceIds, masterService.service.id]);

      const created = await prisma.modelOffer.create({
        data: {
          masterId: master.id,
          masterServiceId: masterService.id,
          serviceId: null,
          serviceIds: selectedServiceIds,
          dateLocal: body.dateLocal,
          timeRangeStartLocal: body.timeRangeStartLocal,
          timeRangeEndLocal: body.timeRangeEndLocal,
          price: typeof priceValue === "number" ? new Prisma.Decimal(priceValue) : null,
          requirements,
          extraBusyMin: body.extraBusyMin ?? 0,
        },
        select: {
          id: true,
          masterId: true,
          masterServiceId: true,
          serviceId: true,
          serviceIds: true,
          dateLocal: true,
          timeRangeStartLocal: true,
          timeRangeEndLocal: true,
          price: true,
          requirements: true,
          extraBusyMin: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          masterService: {
            select: {
              service: {
                select: {
                  id: true,
                  name: true,
                  title: true,
                },
              },
            },
          },
        },
      });

      const selectedServiceLookup = new Map(
        availableMasterServices.map((item) => [
          item.service.id,
          {
            id: item.service.id,
            title: item.service.title?.trim() || item.service.name,
            durationMin: resolveServiceDuration({
              durationOverrideMin: item.durationOverrideMin ?? null,
              baseDurationMin: item.service.baseDurationMin ?? null,
              durationMin: item.service.durationMin,
            }),
            price: item.priceOverride ?? item.service.basePrice ?? item.service.price,
          },
        ])
      );
      const createdPrimaryServiceId = created.masterService?.service.id ?? masterService.service.id;
      const createdPrimaryFallback = {
        id: createdPrimaryServiceId,
        title: masterService.service.title?.trim() || masterService.service.name,
        durationMin:
          masterService.durationOverrideMin ??
          masterService.service.baseDurationMin ??
          masterService.service.durationMin,
        price: masterService.priceOverride ?? masterService.service.basePrice ?? masterService.service.price,
      };
      const createdServiceIds = uniqueStringIds([...(created.serviceIds ?? []), createdPrimaryServiceId]);
      const selectedServices = createdServiceIds
        .map((serviceId) =>
          selectedServiceLookup.get(serviceId) ??
          (serviceId === createdPrimaryServiceId ? createdPrimaryFallback : null)
        )
        .filter((service): service is NonNullable<typeof service> => Boolean(service));

      return NextResponse.json(
        {
          ok: true,
          data: {
            offer: {
              id: created.id,
              masterId: created.masterId,
              masterServiceId: created.masterServiceId ?? createdPrimaryServiceId,
              serviceIds: createdServiceIds,
              selectedServices,
              dateLocal: created.dateLocal,
              timeRangeStartLocal: created.timeRangeStartLocal,
              timeRangeEndLocal: created.timeRangeEndLocal,
              price: toPriceNumber(created.price),
              requirements: created.requirements,
              extraBusyMin: created.extraBusyMin,
              status: created.status,
              createdAt: created.createdAt.toISOString(),
              updatedAt: created.updatedAt.toISOString(),
            },
          },
        },
        { status: 201 }
      );
    }

    const masterId = await getCurrentMasterProviderId(user.id);
    const master = await resolveMasterAccess(masterId, user.id);
    const context = await getMasterContext(master.id);
    if (!context.isSolo) {
      return jsonFail(404, "Service not found", "SERVICE_NOT_FOUND");
    }

    const service = await prisma.service.findFirst({
      where: {
        id: body.masterServiceId,
        providerId: master.id,
        isEnabled: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
        globalCategoryId: true,
        globalCategory: { select: { id: true, name: true } },
      },
    });
    if (!service) {
      return jsonFail(404, "Service not found", "SERVICE_NOT_FOUND");
    }

    const availableServices = await prisma.service.findMany({
      where: {
        providerId: master.id,
        isEnabled: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
      },
    });
    const availableServiceIds = new Set(availableServices.map((item) => item.id));
    const requestedServiceIds = uniqueStringIds(body.serviceIds ?? []);
    const invalidServiceIds = requestedServiceIds.filter((serviceId) => !availableServiceIds.has(serviceId));
    if (invalidServiceIds.length > 0) {
      return jsonFail(404, "Service not found", "SERVICE_NOT_FOUND");
    }
    const selectedServiceIds = uniqueStringIds([...requestedServiceIds, service.id]);

    const created = await prisma.modelOffer.create({
      data: {
        masterId: master.id,
        masterServiceId: null,
        serviceId: service.id,
        serviceIds: selectedServiceIds,
        dateLocal: body.dateLocal,
        timeRangeStartLocal: body.timeRangeStartLocal,
        timeRangeEndLocal: body.timeRangeEndLocal,
        price: typeof priceValue === "number" ? new Prisma.Decimal(priceValue) : null,
        requirements,
        extraBusyMin: body.extraBusyMin ?? 0,
      },
      select: {
        id: true,
        masterId: true,
        masterServiceId: true,
        serviceId: true,
        serviceIds: true,
        dateLocal: true,
        timeRangeStartLocal: true,
        timeRangeEndLocal: true,
        price: true,
        requirements: true,
        extraBusyMin: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        service: {
          select: {
            id: true,
            name: true,
            title: true,
          },
        },
      },
    });

    const selectedServiceLookup = new Map(
      availableServices.map((item) => [
        item.id,
        {
          id: item.id,
          title: item.title?.trim() || item.name,
          durationMin: item.durationMin,
          price: item.price,
        },
      ])
    );
    const createdPrimaryServiceId = created.service?.id ?? service.id;
    const createdPrimaryFallback = {
      id: createdPrimaryServiceId,
      title: service.title?.trim() || service.name,
      durationMin: service.durationMin,
      price: service.price,
    };
    const createdServiceIds = uniqueStringIds([...(created.serviceIds ?? []), createdPrimaryServiceId]);
    const selectedServices = createdServiceIds
      .map((serviceId) =>
        selectedServiceLookup.get(serviceId) ??
        (serviceId === createdPrimaryServiceId ? createdPrimaryFallback : null)
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json(
      {
        ok: true,
        data: {
          offer: {
            id: created.id,
            masterId: created.masterId,
            masterServiceId: created.serviceId ?? created.masterServiceId ?? createdPrimaryServiceId,
            serviceIds: createdServiceIds,
            selectedServices,
            dateLocal: created.dateLocal,
            timeRangeStartLocal: created.timeRangeStartLocal,
            timeRangeEndLocal: created.timeRangeEndLocal,
            price: toPriceNumber(created.price),
            requirements: created.requirements,
            extraBusyMin: created.extraBusyMin,
            status: created.status,
            createdAt: created.createdAt.toISOString(),
            updatedAt: created.updatedAt.toISOString(),
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/model-offers failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/model-offers",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

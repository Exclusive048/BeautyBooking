import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, ProviderType } from "@prisma/client";

export type StudioMasterServiceItem = {
  serviceId: string;
  serviceTitle: string;
  isEnabled: boolean;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  commissionPct: number | null;
};

export type StudioMasterDetails = {
  id: string;
  name: string;
  isActive: boolean;
  tagline: string;
  services: StudioMasterServiceItem[];
};

type StudioContext = {
  id: string;
  providerId: string;
};

async function getStudioContext(studioId: string): Promise<StudioContext> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }
  return studio;
}

export type StudioMasterListItem = {
  id: string;
  name: string;
  isActive: boolean;
  title: string;
  status: "PENDING" | "ACTIVE";
  phone: string | null;
};

export async function listStudioMasters(studioId: string): Promise<{ masters: StudioMasterListItem[] }> {
  const studio = await getStudioContext(studioId);
  const [masters, pendingInvites] = await Promise.all([
    prisma.provider.findMany({
      where: {
        type: "MASTER",
        studioId: studio.providerId,
      },
      select: {
        id: true,
        name: true,
        isPublished: true,
        tagline: true,
        contactPhone: true,
        ownerUserId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.studioInvite.findMany({
      where: {
        studioId: studio.id,
        status: MembershipStatus.PENDING,
      },
      select: {
        phone: true,
      },
    }),
  ]);

  const pendingPhones = new Set(pendingInvites.map((invite) => invite.phone));

  return {
    masters: masters.map((master) => ({
      id: master.id,
      name: master.name,
      isActive: master.isPublished,
      title: master.tagline,
      status: !master.ownerUserId && !!master.contactPhone && pendingPhones.has(master.contactPhone)
        ? "PENDING"
        : "ACTIVE",
      phone: master.contactPhone ?? null,
    })),
  };
}

export async function createStudioMaster(input: {
  studioId: string;
  displayName: string;
  phone: string;
  title: string;
  invitedByUserId: string;
}): Promise<{ id: string }> {
  const studio = await getStudioContext(input.studioId);
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.provider.findFirst({
      where: {
        type: ProviderType.MASTER,
        studioId: studio.providerId,
        contactPhone: input.phone,
      },
      select: { id: true, ownerUserId: true },
      orderBy: { createdAt: "asc" },
    });

    if (existing?.ownerUserId) {
      throw new AppError("Master with this phone already exists", 409, "ALREADY_EXISTS");
    }

    const master = existing
      ? await tx.provider.update({
          where: { id: existing.id },
          data: {
            name: input.displayName.trim(),
            tagline: input.title.trim(),
            isPublished: false,
            contactPhone: input.phone,
          },
          select: { id: true },
        })
      : await tx.provider.create({
          data: {
            type: "MASTER",
            name: input.displayName.trim(),
            tagline: input.title.trim(),
            studioId: studio.providerId,
            ownerUserId: null,
            isPublished: false,
            contactPhone: input.phone,
            address: "",
            district: "",
            timezone: "Asia/Almaty",
            categories: [],
            availableToday: false,
          },
          select: { id: true },
        });

    await tx.studioInvite.upsert({
      where: {
        studioId_phone: {
          studioId: studio.id,
          phone: input.phone,
        },
      },
      update: {
        status: MembershipStatus.PENDING,
        invitedByUserId: input.invitedByUserId,
      },
      create: {
        studioId: studio.id,
        phone: input.phone,
        status: MembershipStatus.PENDING,
        invitedByUserId: input.invitedByUserId,
      },
      select: { id: true },
    });

    return master;
  });

  return { id: created.id };
}

export async function getStudioMasterDetails(input: {
  studioId: string;
  masterId: string;
}): Promise<StudioMasterDetails> {
  const studio = await getStudioContext(input.studioId);

  const master = await prisma.provider.findFirst({
    where: { id: input.masterId, type: "MASTER", studioId: studio.providerId },
    select: {
      id: true,
      name: true,
      isPublished: true,
      tagline: true,
      masterServices: {
        select: {
          serviceId: true,
          isEnabled: true,
          priceOverride: true,
          durationOverrideMin: true,
          commissionPct: true,
          service: { select: { name: true, title: true } },
        },
      },
    },
  });

  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  return {
    id: master.id,
    name: master.name,
    isActive: master.isPublished,
    tagline: master.tagline,
    services: master.masterServices.map((item) => ({
      serviceId: item.serviceId,
      serviceTitle: item.service.title?.trim() || item.service.name,
      isEnabled: item.isEnabled,
      priceOverride: item.priceOverride ?? null,
      durationOverrideMin: item.durationOverrideMin ?? null,
      commissionPct: item.commissionPct ?? null,
    })),
  };
}

export async function bulkUpdateMasterServices(input: {
  studioId: string;
  masterId: string;
  items: Array<{
    serviceId: string;
    isEnabled: boolean;
    priceOverride?: number | null;
    durationOverrideMin?: number | null;
    commissionPct?: number | null;
  }>;
}): Promise<{ updated: number }> {
  if (input.items.length === 0) return { updated: 0 };

  await prisma.$transaction(
    input.items.map((item) =>
      prisma.masterService.upsert({
        where: { masterProviderId_serviceId: { masterProviderId: input.masterId, serviceId: item.serviceId } },
        create: {
          studioId: input.studioId,
          masterProviderId: input.masterId,
          masterId: input.masterId,
          serviceId: item.serviceId,
          isEnabled: item.isEnabled,
          priceOverride: item.priceOverride ?? null,
          durationOverrideMin: item.durationOverrideMin ?? null,
          ...(typeof item.commissionPct === "number" || item.commissionPct === null
            ? { commissionPct: item.commissionPct }
            : {}),
        },
        update: {
          studioId: input.studioId,
          masterId: input.masterId,
          isEnabled: item.isEnabled,
          priceOverride: item.priceOverride ?? null,
          durationOverrideMin: item.durationOverrideMin ?? null,
          ...(typeof item.commissionPct === "number" || item.commissionPct === null
            ? { commissionPct: item.commissionPct }
            : {}),
        },
      })
    )
  );

  return { updated: input.items.length };
}

export async function updateStudioMasterProfile(input: {
  studioId: string;
  masterId: string;
  displayName?: string;
  tagline?: string;
  isActive?: boolean;
}): Promise<{ id: string }> {
  const studio = await getStudioContext(input.studioId);

  const master = await prisma.provider.findFirst({
    where: {
      id: input.masterId,
      type: "MASTER",
      studioId: studio.providerId,
    },
    select: { id: true },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  await prisma.provider.update({
    where: { id: master.id },
    data: {
      ...(input.displayName ? { name: input.displayName } : {}),
      ...(input.tagline ? { tagline: input.tagline } : {}),
      ...(typeof input.isActive === "boolean" ? { isPublished: input.isActive } : {}),
    },
  });

  return { id: master.id };
}

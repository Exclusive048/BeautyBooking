import { prisma } from "@/lib/prisma";
import { AccountType, MembershipStatus, ProviderType } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { emptyBodySchema } from "@/lib/providers/schemas";
import { requireAuth } from "@/lib/auth/guards";
import { mapProviderProfile } from "@/lib/providers/mappers";

function providerTypeFromRoles(roles: AccountType[]) {
  if (roles.includes(AccountType.MASTER)) return ProviderType.MASTER;
  if (roles.includes(AccountType.STUDIO)) {
    return ProviderType.STUDIO;
  }
  return null;
}

const providerWithServicesInclude = {
  services: {
    select: {
      id: true,
      name: true,
      durationMin: true,
      price: true,
    },
  },
};

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const studioId = url.searchParams.get("studioId");

  if (studioId) {
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: {
        id: true,
        provider: {
          include: providerWithServicesInclude,
        },
      },
    });

    if (!studio || studio.provider.type !== ProviderType.STUDIO) {
      return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
    }

    if (studio.provider.ownerUserId !== user.id) {
      const membership = await prisma.studioMembership.findFirst({
        where: { userId: user.id, studioId: studio.id, status: MembershipStatus.ACTIVE },
        select: { id: true },
      });

      if (!membership) {
        return fail("Forbidden", 403, "FORBIDDEN");
      }
    }

    return ok({ provider: mapProviderProfile(studio.provider) });
  }

  if (typeParam === "MASTER") {
    const masterProvider = await prisma.provider.findFirst({
      where: { ownerUserId: user.id, type: ProviderType.MASTER },
      include: providerWithServicesInclude,
    });

    return ok({ provider: masterProvider ? mapProviderProfile(masterProvider) : null });
  }

  if (typeParam === "STUDIO") {
    const ownedStudioProvider = await prisma.provider.findFirst({
      where: { ownerUserId: user.id, type: ProviderType.STUDIO },
      include: providerWithServicesInclude,
    });

    if (ownedStudioProvider) {
      return ok({ provider: mapProviderProfile(ownedStudioProvider) });
    }

    const memberships = await prisma.studioMembership.findMany({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      select: {
        studio: {
          select: {
            provider: {
              include: providerWithServicesInclude,
            },
          },
        },
      },
    });

    if (memberships.length === 1) {
      return ok({ provider: mapProviderProfile(memberships[0].studio.provider) });
    }

    if (memberships.length > 1) {
      return fail("Studio selection required", 409, "STUDIO_SELECTION_REQUIRED");
    }

    return ok({ provider: null });
  }

  const myProvider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id },
    include: providerWithServicesInclude,
  });

  return ok({ provider: myProvider ? mapProviderProfile(myProvider) : null });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = emptyBodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const pType = providerTypeFromRoles(user.roles);
  if (!pType) {
    return fail("Forbidden", 403, "FORBIDDEN_ROLE");
  }

  const existing = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: pType },
    include: providerWithServicesInclude,
  });

  if (existing) {
    return ok({ provider: mapProviderProfile(existing) });
  }

  const created = await prisma.provider.create({
    data: {
      ownerUserId: user.id,
      type: pType,
      name: pType === ProviderType.MASTER ? "New master" : "New studio",
      tagline: "Add a description in settings",
      rating: 0,
      reviews: 0,
      priceFrom: 0,
      address: "Address not set",
      district: "District not set",
      categories: [],
      availableToday: false,
    },
    include: providerWithServicesInclude,
  });

  return ok({ provider: mapProviderProfile(created) }, { status: 201 });
}

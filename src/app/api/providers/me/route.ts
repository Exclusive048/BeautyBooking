import { prisma } from "@/lib/prisma";
import { AccountType, ProviderType } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { emptyBodySchema } from "@/lib/providers/schemas";
import { requireAuth } from "@/lib/auth/guards";
import { mapProviderProfile } from "@/lib/providers/mappers";

function providerTypeFromRoles(roles: AccountType[]) {
  if (roles.includes(AccountType.MASTER)) return ProviderType.MASTER;
  if (roles.includes(AccountType.STUDIO) || roles.includes(AccountType.STUDIO_ADMIN)) {
    return ProviderType.STUDIO;
  }
  return null;
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const myProvider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id },
    include: {
      services: {
        select: {
          id: true,
          name: true,
          durationMin: true,
          price: true,
        },
      },
    },
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
    include: {
      services: {
        select: {
          id: true,
          name: true,
          durationMin: true,
          price: true,
        },
      },
    },
  });

  if (existing) {
    return ok({ provider: mapProviderProfile(existing) });
  }

  const created = await prisma.provider.create({
    data: {
      ownerUserId: user.id,
      type: pType,
      name: pType === ProviderType.MASTER ? "Новый мастер" : "Новая студия",
      tagline: "Добавьте описание в настройках",
      rating: 0,
      reviews: 0,
      priceFrom: 0,
      address: "Адрес не указан",
      district: "Район не указан",
      categories: [],
      availableToday: false,
    },
    include: {
      services: {
        select: {
          id: true,
          name: true,
          durationMin: true,
          price: true,
        },
      },
    },
  });

  return ok({ provider: mapProviderProfile(created) }, { status: 201 });
}

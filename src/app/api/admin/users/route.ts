import { AccountType, Prisma, ProviderType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { parseQuery } from "@/lib/validation";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

const querySchema = z.object({
  filter: z.enum(["all", "masters", "studios", "clients"]).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const patchSchema = z.object({
  userId: z.string().trim().min(1),
  planId: z.string().trim().min(1),
});

type UserType = "client" | "master" | "studio";
type UserFilter = "all" | "masters" | "studios" | "clients";

const MASTER_WHERE: Prisma.UserProfileWhereInput = {
  OR: [
    { roles: { has: AccountType.MASTER } },
    { providers: { some: { type: ProviderType.MASTER } } },
  ],
};

const STUDIO_WHERE: Prisma.UserProfileWhereInput = {
  OR: [
    { roles: { has: AccountType.STUDIO } },
    { roles: { has: AccountType.STUDIO_ADMIN } },
    { providers: { some: { type: ProviderType.STUDIO } } },
  ],
};

function buildUserFilterWhere(filter: UserFilter): Prisma.UserProfileWhereInput | undefined {
  if (filter === "masters") {
    return {
      AND: [MASTER_WHERE, { NOT: STUDIO_WHERE }],
    };
  }
  if (filter === "studios") {
    return STUDIO_WHERE;
  }
  if (filter === "clients") {
    return {
      NOT: {
        OR: [MASTER_WHERE, STUDIO_WHERE],
      },
    };
  }
  return undefined;
}

function resolveUserType(roles: AccountType[], providerTypes: ProviderType[]): UserType {
  const isStudio =
    roles.includes(AccountType.STUDIO) ||
    roles.includes(AccountType.STUDIO_ADMIN) ||
    providerTypes.includes(ProviderType.STUDIO);
  if (isStudio) return "studio";

  const isMaster = roles.includes(AccountType.MASTER) || providerTypes.includes(ProviderType.MASTER);
  if (isMaster) return "master";

  return "client";
}

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const query = parseQuery(new URL(req.url), querySchema);
    const filter = query.filter ?? "all";
    const where = buildUserFilterWhere(filter);

    const users = await prisma.userProfile.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        displayName: true,
        phone: true,
        email: true,
        roles: true,
        createdAt: true,
        providers: {
          select: { type: true },
        },
        subscriptions: {
          select: {
            scope: true,
            status: true,
            currentPeriodEnd: true,
            plan: { select: { id: true, code: true, name: true, tier: true, scope: true } },
          },
        },
      },
    });
    const hasMore = users.length > query.limit;
    const pageUsers = hasMore ? users.slice(0, query.limit) : users;
    const nextCursor = hasMore ? pageUsers[pageUsers.length - 1]?.id ?? null : null;

    const mapped = pageUsers.map((user) => {
      const providerTypes = user.providers.map((p) => p.type);
      const type = resolveUserType(user.roles, providerTypes);
      const subscriptions = user.subscriptions ?? [];
      return {
        id: user.id,
        displayName: user.displayName,
        phone: user.phone,
        email: user.email,
        roles: user.roles,
        type,
        createdAt: user.createdAt.toISOString(),
        subscriptions: subscriptions.map((subscription) => ({
          scope: subscription.scope,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd
            ? subscription.currentPeriodEnd.toISOString()
            : null,
          plan: subscription.plan,
        })),
      };
    });

    const [total, clients, masters, studios] = await Promise.all([
      prisma.userProfile.count(),
      prisma.userProfile.count({
        where: {
          NOT: {
            OR: [MASTER_WHERE, STUDIO_WHERE],
          },
        },
      }),
      prisma.userProfile.count({
        where: {
          AND: [MASTER_WHERE, { NOT: STUDIO_WHERE }],
        },
      }),
      prisma.userProfile.count({ where: STUDIO_WHERE }),
    ]);

    const summary = {
      total,
      clients,
      masters,
      studios,
    };

    return ok({ users: mapped, summary, nextCursor });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { userId, planId } = parsed.data;

    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return fail("Пользователь не найден", 404, "NOT_FOUND");
    }

    const plan = await prisma.billingPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      return fail("Тариф не найден", 404, "NOT_FOUND");
    }

    const now = new Date();
    const subscription = await prisma.userSubscription.upsert({
      where: { userId_scope: { userId, scope: plan.scope } },
      create: {
        userId,
        scope: plan.scope,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        periodMonths: 1,
        autoRenew: false,
        cancelAtPeriodEnd: false,
      },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: null,
        autoRenew: false,
        cancelAtPeriodEnd: false,
      },
      select: {
        scope: true,
        status: true,
        currentPeriodEnd: true,
        plan: { select: { id: true, code: true, name: true, tier: true, scope: true } },
      },
    });

    return ok({ subscription });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

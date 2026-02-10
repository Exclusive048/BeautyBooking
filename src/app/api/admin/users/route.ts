import { AccountType, ProviderType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { parseQuery } from "@/lib/validation";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

const querySchema = z.object({
  filter: z.enum(["all", "masters", "studios", "clients"]).optional(),
});

const patchSchema = z.object({
  userId: z.string().trim().min(1),
  planId: z.string().trim().min(1),
});

type UserType = "client" | "master" | "studio";

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

    const users = await prisma.userProfile.findMany({
      orderBy: { createdAt: "desc" },
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
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            status: true,
            plan: { select: { id: true, code: true, name: true, price: true } },
          },
        },
      },
    });

    const mapped = users.map((user) => {
      const providerTypes = user.providers.map((p) => p.type);
      const type = resolveUserType(user.roles, providerTypes);
      const subscription = user.subscriptions[0] ?? null;
      return {
        id: user.id,
        displayName: user.displayName,
        phone: user.phone,
        email: user.email,
        roles: user.roles,
        type,
        createdAt: user.createdAt.toISOString(),
        subscription: subscription
          ? {
              status: subscription.status,
              plan: subscription.plan,
            }
          : null,
      };
    });

    const filtered = mapped.filter((user) => {
      if (filter === "all") return true;
      if (filter === "masters") return user.type === "master";
      if (filter === "studios") return user.type === "studio";
      if (filter === "clients") return user.type === "client";
      return true;
    });

    const summary = {
      total: mapped.length,
      clients: mapped.filter((u) => u.type === "client").length,
      masters: mapped.filter((u) => u.type === "master").length,
      studios: mapped.filter((u) => u.type === "studio").length,
    };

    return ok({ users: filtered, summary });
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

    const subscription = await prisma.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        planId: plan.id,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: null,
      },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        endsAt: null,
      },
      select: {
        status: true,
        plan: { select: { id: true, code: true, name: true, price: true } },
      },
    });

    return ok({ subscription });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { BILLING_PERIODS } from "@/lib/billing/constants";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import {
  FEATURE_CATALOG,
  type LimitFeatureKey,
} from "@/lib/billing/feature-catalog";
import {
  parseOverrides,
  resolveEffectiveFeatures,
  isRelaxedLimit,
  type PlanFeatureOverrides,
  type PlanNode,
} from "@/lib/billing/features";
import * as cache from "@/lib/cache/cache";

const patchSchema = z.object({
  id: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  prices: z
    .array(
      z.object({
        periodMonths: z.number().int().refine((value) => BILLING_PERIODS.includes(value as (typeof BILLING_PERIODS)[number])),
        priceKopeks: z.number().int().min(0),
        isActive: z.boolean().optional(),
      })
    )
    .optional(),
  sortOrder: z.number().int().optional(),
  tier: z.enum(["FREE", "PRO", "PREMIUM"]).optional(),
  scope: z.enum(["MASTER", "STUDIO"]).optional(),
  isActive: z.boolean().optional(),
  inheritsFromPlanId: z.string().trim().min(1).nullable().optional(),
  features: z.record(z.string(), z.unknown()).optional(),
});

const createSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  prices: z.array(
    z.object({
      periodMonths: z.number().int().refine((value) => BILLING_PERIODS.includes(value as (typeof BILLING_PERIODS)[number])),
      priceKopeks: z.number().int().min(0),
      isActive: z.boolean().optional(),
    })
  ),
  sortOrder: z.number().int().optional(),
  tier: z.enum(["FREE", "PRO", "PREMIUM"]),
  scope: z.enum(["MASTER", "STUDIO"]),
  isActive: z.boolean().optional(),
  inheritsFromPlanId: z.string().trim().min(1).nullable().optional(),
  features: z.record(z.string(), z.unknown()).optional(),
});

function normalizePrices(prices: Array<{ periodMonths: number; priceKopeks: number; isActive?: boolean }>) {
  const byPeriod = new Map<number, { periodMonths: number; priceKopeks: number; isActive?: boolean }>();
  for (const entry of prices) {
    if (!BILLING_PERIODS.includes(entry.periodMonths as (typeof BILLING_PERIODS)[number])) continue;
    byPeriod.set(entry.periodMonths, entry);
  }
  return Array.from(byPeriod.values());
}

const LIMIT_FEATURE_KEYS = Object.keys(FEATURE_CATALOG).filter(
  (key) => FEATURE_CATALOG[key as keyof typeof FEATURE_CATALOG].kind === "limit"
) as LimitFeatureKey[];

function buildPlanMap(plans: Array<{ id: string; inheritsFromPlanId: string | null; features: unknown }>): Map<string, PlanNode> {
  return new Map(plans.map((plan) => [plan.id, plan]));
}

/**
 * Invalidate plan cache for all users subscribed to the given planId.
 * Uses pattern delete so we don't need to enumerate individual users.
 */
async function invalidatePlanCacheForPlanSubscribers(planId: string): Promise<void> {
  try {
    // Pattern covers both MASTER and STUDIO scopes: plan:current:<userId>:<scope>
    await cache.delByPattern("plan:current:*");
    logInfo("Invalidated plan cache after admin billing update", { planId });
  } catch (err) {
    // Non-fatal — cache will expire on its own (TTL 5 min)
    logError("Failed to invalidate plan cache after admin billing update", {
      planId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

async function assertNoInheritanceCycle(planId: string, inheritsFromPlanId: string | null) {
  if (!inheritsFromPlanId) return;
  let current: string | null = inheritsFromPlanId;
  const visited = new Set<string>();

  while (current) {
    if (current === planId) {
      throw new AppError("Inheritance cycle detected", 400, "VALIDATION_ERROR", {
        fieldErrors: { inheritsFromPlanId: "Inheritance creates a cycle." },
      });
    }
    if (visited.has(current)) break;
    visited.add(current);
    const parent: { id: string; inheritsFromPlanId: string | null } | null =
      await prisma.billingPlan.findUnique({
        where: { id: current },
        select: { id: true, inheritsFromPlanId: true },
      });
    current = parent?.inheritsFromPlanId ?? null;
  }
}

async function assertParentExists(inheritsFromPlanId: string | null) {
  if (!inheritsFromPlanId) return;
  const parent = await prisma.billingPlan.findUnique({
    where: { id: inheritsFromPlanId },
    select: { id: true },
  });
  if (!parent) {
    throw new AppError("Parent plan not found", 404, "NOT_FOUND", {
      fieldErrors: { inheritsFromPlanId: "Parent plan not found." },
    });
  }
}

function assertRelaxedLimits(
  overrides: PlanFeatureOverrides,
  parentEffective: Record<LimitFeatureKey, number | null | undefined>
) {
  for (const key of LIMIT_FEATURE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    const nextValue = overrides[key];
    if (!isRelaxedLimit(parentEffective[key], nextValue ?? null)) {
      throw new AppError("Limit cannot be stricter than parent", 400, "VALIDATION_ERROR", {
        fieldErrors: { [key]: "Limit cannot be stricter than parent." },
      });
    }
  }
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      features: true,
      sortOrder: true,
      inheritsFromPlanId: true,
      isActive: true,
      updatedAt: true,
      prices: {
        select: { id: true, periodMonths: true, priceKopeks: true, isActive: true },
        orderBy: { periodMonths: "asc" },
      },
    },
  });

  return ok({ plans });
}

export async function POST(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const existingCode = await prisma.billingPlan.findUnique({
      where: { code: parsed.data.code },
      select: { id: true },
    });
    if (existingCode) {
      return fail("Plan code already exists", 409, "ALREADY_EXISTS", {
        fieldErrors: { code: "Plan with this code already exists." },
      });
    }

    await assertParentExists(parsed.data.inheritsFromPlanId ?? null);

    const plans = await prisma.billingPlan.findMany({
      select: { id: true, inheritsFromPlanId: true, features: true },
    });
    const plansById = buildPlanMap(plans);
    const parentEffective = parsed.data.inheritsFromPlanId
      ? (resolveEffectiveFeatures(parsed.data.inheritsFromPlanId, plansById) as Record<LimitFeatureKey, number | null | undefined>)
      : ({} as Record<LimitFeatureKey, number | null | undefined>);
    const overrides = parseOverrides(parsed.data.features);
    assertRelaxedLimits(overrides, parentEffective);

    const normalized = normalizePrices(parsed.data.prices);
    const missingPeriods = BILLING_PERIODS.filter(
      (period) => !normalized.some((entry) => entry.periodMonths === period)
    );
    if (missingPeriods.length > 0) {
      return fail("Укажите цены для всех периодов подписки.", 400, "VALIDATION_ERROR", {
        fieldErrors: { prices: "Нужны цены для 1/3/6/12 месяцев." },
      });
    }
    const created = await prisma.billingPlan.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        tier: parsed.data.tier,
        scope: parsed.data.scope,
        sortOrder: parsed.data.sortOrder ?? 0,
        inheritsFromPlanId: parsed.data.inheritsFromPlanId ?? null,
        features: overrides as Prisma.InputJsonValue,
        isActive: parsed.data.isActive ?? true,
        prices: {
          create: normalized.map((entry) => ({
            periodMonths: entry.periodMonths,
            priceKopeks: entry.priceKopeks,
            isActive: entry.isActive ?? true,
          })),
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        tier: true,
        scope: true,
        features: true,
        sortOrder: true,
        inheritsFromPlanId: true,
        isActive: true,
        updatedAt: true,
        prices: {
          select: { id: true, periodMonths: true, priceKopeks: true, isActive: true },
          orderBy: { periodMonths: "asc" },
        },
      },
    });

    return ok({ plan: created });
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

    const {
      id,
      code,
      name,
      prices,
      features,
      sortOrder,
      inheritsFromPlanId,
      tier,
      scope,
      isActive,
    } = parsed.data;

    await assertParentExists(inheritsFromPlanId ?? null);
    if (inheritsFromPlanId) {
      await assertNoInheritanceCycle(id, inheritsFromPlanId);
    }

    if (code) {
      const existingCode = await prisma.billingPlan.findUnique({
        where: { code },
        select: { id: true },
      });
      if (existingCode && existingCode.id !== id) {
        return fail("Plan code already exists", 409, "ALREADY_EXISTS", {
          fieldErrors: { code: "Plan with this code already exists." },
        });
      }
    }

    const plans = await prisma.billingPlan.findMany({
      select: { id: true, inheritsFromPlanId: true, features: true },
    });
    const plansById = buildPlanMap(plans);
    const parentEffective = inheritsFromPlanId
      ? (resolveEffectiveFeatures(inheritsFromPlanId, plansById) as Record<LimitFeatureKey, number | null | undefined>)
      : ({} as Record<LimitFeatureKey, number | null | undefined>);
    const overrides = features ? parseOverrides(features) : null;
    if (overrides) {
      assertRelaxedLimits(overrides, parentEffective);
    }

    await prisma.billingPlan.update({
      where: { id },
      data: {
        ...(code ? { code } : {}),
        name,
        ...(overrides ? { features: overrides as Prisma.InputJsonValue } : {}),
        ...(typeof sortOrder === "number" ? { sortOrder } : {}),
        ...(inheritsFromPlanId !== undefined ? { inheritsFromPlanId } : {}),
        ...(tier ? { tier } : {}),
        ...(scope ? { scope } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        tier: true,
        scope: true,
        features: true,
        sortOrder: true,
        inheritsFromPlanId: true,
        isActive: true,
        updatedAt: true,
        prices: {
          select: { id: true, periodMonths: true, priceKopeks: true, isActive: true },
          orderBy: { periodMonths: "asc" },
        },
      },
    });

    if (prices && prices.length > 0) {
      const normalized = normalizePrices(prices);
      if (normalized.length > 0) {
        for (const entry of normalized) {
          await prisma.billingPlanPrice.upsert({
            where: { planId_periodMonths: { planId: id, periodMonths: entry.periodMonths } },
            create: {
              planId: id,
              periodMonths: entry.periodMonths,
              priceKopeks: entry.priceKopeks,
              isActive: entry.isActive ?? true,
            },
            update: {
              priceKopeks: entry.priceKopeks,
              ...(typeof entry.isActive === "boolean" ? { isActive: entry.isActive } : {}),
            },
          });
        }
      }
    }

    const plan = await prisma.billingPlan.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        tier: true,
        scope: true,
        features: true,
        sortOrder: true,
        inheritsFromPlanId: true,
        isActive: true,
        updatedAt: true,
        prices: {
          select: { id: true, periodMonths: true, priceKopeks: true, isActive: true },
          orderBy: { periodMonths: "asc" },
        },
      },
    });

    if (!plan) {
      return fail("Plan not found", 404, "NOT_FOUND");
    }

    // Invalidate cached plan features for all subscribers
    void invalidatePlanCacheForPlanSubscribers(id);

    return ok({ plan });
  } catch (error) {
    logError("PATCH /api/admin/billing failed", {
      requestId: getRequestId(req),
      route: "PATCH /api/admin/billing",
      stack: error instanceof Error ? error.stack : undefined,
    });
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}



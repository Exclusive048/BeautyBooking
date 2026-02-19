import { Prisma, ProviderType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
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
  type PlanTier,
} from "@/lib/billing/features";

const patchSchema = z.object({
  id: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  price: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
  tier: z.enum(["FREE", "PRO", "PREMIUM"]).optional(),
  providerType: z.enum(["MASTER", "STUDIO"]).optional(),
  isActive: z.boolean().optional(),
  inheritsFromPlanId: z.string().trim().min(1).nullable().optional(),
  features: z.record(z.string(), z.unknown()).optional(),
});

const createSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
  tier: z.enum(["FREE", "PRO", "PREMIUM"]),
  providerType: z.enum(["MASTER", "STUDIO"]),
  isActive: z.boolean().optional(),
  inheritsFromPlanId: z.string().trim().min(1).nullable().optional(),
  features: z.record(z.string(), z.unknown()).optional(),
});

const DEFAULT_PLANS: Array<{
  code: string;
  name: string;
  price: number;
  tier: PlanTier;
  providerType: ProviderType;
  features: PlanFeatureOverrides;
  sortOrder: number;
  inheritsFrom: string | null;
}> = [
  {
    code: "MASTER_FREE",
    name: "MASTER FREE",
    price: 0,
    tier: "FREE",
    providerType: ProviderType.MASTER,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
    },
    sortOrder: 0,
    inheritsFrom: null,
  },
  {
    code: "MASTER_PRO",
    name: "MASTER PRO",
    price: 600,
    tier: "PRO",
    providerType: ProviderType.MASTER,
    features: {},
    sortOrder: 10,
    inheritsFrom: "MASTER_FREE",
  },
  {
    code: "MASTER_PREMIUM",
    name: "MASTER PREMIUM",
    price: 1500,
    tier: "PREMIUM",
    providerType: ProviderType.MASTER,
    features: {},
    sortOrder: 20,
    inheritsFrom: "MASTER_PRO",
  },
  {
    code: "STUDIO_FREE",
    name: "STUDIO FREE",
    price: 0,
    tier: "FREE",
    providerType: ProviderType.STUDIO,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
    },
    sortOrder: 0,
    inheritsFrom: null,
  },
  {
    code: "STUDIO_PRO",
    name: "STUDIO PRO",
    price: 2000,
    tier: "PRO",
    providerType: ProviderType.STUDIO,
    features: {},
    sortOrder: 10,
    inheritsFrom: "STUDIO_FREE",
  },
  {
    code: "STUDIO_PREMIUM",
    name: "STUDIO PREMIUM",
    price: 5000,
    tier: "PREMIUM",
    providerType: ProviderType.STUDIO,
    features: {},
    sortOrder: 20,
    inheritsFrom: "STUDIO_PRO",
  },
];

const LIMIT_FEATURE_KEYS = Object.keys(FEATURE_CATALOG).filter(
  (key) => FEATURE_CATALOG[key as keyof typeof FEATURE_CATALOG].kind === "limit"
) as LimitFeatureKey[];

async function ensureDefaultPlans() {
  const existing = await prisma.billingPlan.findMany({
    select: {
      id: true,
      code: true,
      inheritsFromPlanId: true,
      sortOrder: true,
      tier: true,
      providerType: true,
      name: true,
      price: true,
      features: true,
    },
  });
  const byCode = new Map(existing.map((plan) => [plan.code, plan]));

  const missing = DEFAULT_PLANS.filter((plan) => !byCode.has(plan.code));
  if (missing.length > 0) {
    for (const plan of missing) {
      const inheritsFromPlanId = plan.inheritsFrom ? byCode.get(plan.inheritsFrom)?.id ?? null : null;
      const created = await prisma.billingPlan.create({
        data: {
          code: plan.code,
          name: plan.name,
          price: plan.price,
          tier: plan.tier,
          providerType: plan.providerType,
          features: plan.features as Prisma.InputJsonValue,
          sortOrder: plan.sortOrder ?? 0,
          inheritsFromPlanId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          inheritsFromPlanId: true,
          sortOrder: true,
          tier: true,
          providerType: true,
          name: true,
          price: true,
          features: true,
        },
      });
      byCode.set(created.code, created);
    }
  }

  const updates = DEFAULT_PLANS.flatMap((plan) => {
    const existingPlan = byCode.get(plan.code);
    if (!existingPlan) return [];
    const desiredInheritsFromId = plan.inheritsFrom ? byCode.get(plan.inheritsFrom)?.id ?? null : null;
    const desiredSortOrder = plan.sortOrder ?? 0;
    const needsTier = existingPlan.tier !== plan.tier;
    const needsProviderType = existingPlan.providerType !== plan.providerType;
    const needsSort = existingPlan.sortOrder !== desiredSortOrder;
    const needsParent = (existingPlan.inheritsFromPlanId ?? null) !== (desiredInheritsFromId ?? null);

    if (!needsSort && !needsParent && !needsTier && !needsProviderType) {
      return [];
    }

    return [
      prisma.billingPlan.update({
        where: { id: existingPlan.id },
        data: {
          sortOrder: desiredSortOrder,
          inheritsFromPlanId: desiredInheritsFromId,
          ...(needsTier ? { tier: plan.tier } : {}),
          ...(needsProviderType ? { providerType: plan.providerType } : {}),
        },
      }),
    ];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

function buildPlanMap(plans: Array<{ id: string; inheritsFromPlanId: string | null; features: unknown }>): Map<string, PlanNode> {
  return new Map(plans.map((plan) => [plan.id, plan]));
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

  await ensureDefaultPlans();

  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ providerType: "asc" }, { sortOrder: "asc" }, { price: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      tier: true,
      providerType: true,
      features: true,
      sortOrder: true,
      inheritsFromPlanId: true,
      isActive: true,
      updatedAt: true,
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

    const created = await prisma.billingPlan.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        price: parsed.data.price,
        tier: parsed.data.tier,
        providerType: parsed.data.providerType,
        sortOrder: parsed.data.sortOrder ?? 0,
        inheritsFromPlanId: parsed.data.inheritsFromPlanId ?? null,
        features: overrides as Prisma.InputJsonValue,
        isActive: parsed.data.isActive ?? true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        tier: true,
        providerType: true,
        features: true,
        sortOrder: true,
        inheritsFromPlanId: true,
        isActive: true,
        updatedAt: true,
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
      price,
      features,
      sortOrder,
      inheritsFromPlanId,
      tier,
      providerType,
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

    const updated = await prisma.billingPlan.update({
      where: { id },
      data: {
        ...(code ? { code } : {}),
        name,
        price,
        ...(overrides ? { features: overrides as Prisma.InputJsonValue } : {}),
        ...(typeof sortOrder === "number" ? { sortOrder } : {}),
        ...(inheritsFromPlanId !== undefined ? { inheritsFromPlanId } : {}),
        ...(tier ? { tier } : {}),
        ...(providerType ? { providerType } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        tier: true,
        providerType: true,
        features: true,
        sortOrder: true,
        inheritsFromPlanId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return ok({ plan: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

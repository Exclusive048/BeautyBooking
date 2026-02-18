import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

const patchSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
  inheritsFromPlanId: z.string().trim().min(1).nullable().optional(),
  features: z.record(z.string(), z.unknown()),
});

const DEFAULT_PLANS = [
  {
    code: "FREE",
    name: "FREE — Визитка",
    price: 0,
    features: {
      onlinePayments: false,
      hotSlots: false,
      analyticsCharts: false,
      financeReport: false,
      tgNotifications: false,
      vkNotifications: false,
      maxNotifications: false,
      smsNotifications: false,
      clientVisitHistory: false,
      clientNotes: false,
      clientImport: false,
      catalogPriority: "FREE",
      highlightCard: false,
      maxTeamMasters: 2,
      maxPortfolioPhotosSolo: 15,
      maxPortfolioPhotosStudioDesign: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
    sortOrder: 0,
    inheritsFrom: null,
  },
  {
    code: "START",
    name: "START — CRM / запись",
    price: 990,
    features: {},
    sortOrder: 5,
    inheritsFrom: "FREE",
  },
  {
    code: "PRO",
    name: "PRO — Продвижение / лиды",
    price: 2490,
    features: {
      onlinePayments: true,
      financeReport: true,
      tgNotifications: true,
      vkNotifications: true,
      maxNotifications: true,
      smsNotifications: true,
      clientVisitHistory: true,
      clientNotes: true,
      catalogPriority: "PRO",
      maxTeamMasters: 7,
      maxPortfolioPhotosSolo: null,
      maxPortfolioPhotosStudioDesign: null,
      maxPortfolioPhotosPerStudioMaster: null,
    },
    sortOrder: 10,
    inheritsFrom: "FREE",
  },
  {
    code: "PREMIUM",
    name: "PREMIUM - Maximum",
    price: 4990,
    features: {
      hotSlots: true,
      analyticsCharts: true,
      clientImport: true,
      catalogPriority: "PREMIUM",
      highlightCard: true,
      maxTeamMasters: null,
    },
    sortOrder: 20,
    inheritsFrom: "PRO",
  },
  {
    code: "STUDIO",
    name: "STUDIO / TEAMS",
    price: 4990,
    features: {},
    sortOrder: 15,
    inheritsFrom: "PRO",
  },
];

async function ensureDefaultPlans() {
  const existing = await prisma.billingPlan.findMany({
    select: { id: true, code: true, inheritsFromPlanId: true, sortOrder: true },
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
          features: plan.features,
          sortOrder: plan.sortOrder ?? 0,
          inheritsFromPlanId,
          isActive: true,
        },
        select: { id: true, code: true, inheritsFromPlanId: true, sortOrder: true },
      });
      byCode.set(created.code, created);
    }
  }

  const updates = DEFAULT_PLANS.flatMap((plan) => {
    const existingPlan = byCode.get(plan.code);
    if (!existingPlan) return [];
    const desiredInheritsFromId = plan.inheritsFrom ? byCode.get(plan.inheritsFrom)?.id ?? null : null;
    const desiredSortOrder = plan.sortOrder ?? 0;
    if (
      existingPlan.sortOrder === desiredSortOrder &&
      (existingPlan.inheritsFromPlanId ?? null) === (desiredInheritsFromId ?? null)
    ) {
      return [];
    }
    return [
      prisma.billingPlan.update({
        where: { id: existingPlan.id },
        data: {
          sortOrder: desiredSortOrder,
          inheritsFromPlanId: desiredInheritsFromId,
        },
      }),
    ];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  await ensureDefaultPlans();

  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      features: true,
      sortOrder: true,
      inheritsFromPlanId: true,
      isActive: true,
      updatedAt: true,
    },
  });

  return ok({ plans });
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

    const { id, name, price, features, sortOrder, inheritsFromPlanId } = parsed.data;

    const updated = await prisma.billingPlan.update({
      where: { id },
      data: {
        name,
        price,
        features: features as Prisma.InputJsonValue,
        ...(typeof sortOrder === "number" ? { sortOrder } : {}),
        ...(inheritsFromPlanId !== undefined ? { inheritsFromPlanId } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
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

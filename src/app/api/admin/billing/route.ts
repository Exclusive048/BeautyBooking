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
  features: z.record(z.string(), z.boolean()),
});

const DEFAULT_PLANS = [
  {
    code: "FREE",
    name: "FREE — Визитка",
    price: 0,
    features: {
      profile: true,
      portfolio: true,
      onlineBooking: true,
      smsReminders: false,
      bookingLink: false,
      windowGenerator: false,
      priorityListing: false,
      proBadge: false,
      broadcasts: false,
      multiStaff: false,
      sharedCalendar: false,
    },
  },
  {
    code: "START",
    name: "START — CRM / запись",
    price: 990,
    features: {
      profile: true,
      portfolio: true,
      onlineBooking: true,
      smsReminders: true,
      bookingLink: true,
      windowGenerator: true,
      priorityListing: false,
      proBadge: false,
      broadcasts: false,
      multiStaff: false,
      sharedCalendar: false,
    },
  },
  {
    code: "PRO",
    name: "PRO — Продвижение / лиды",
    price: 2490,
    features: {
      profile: true,
      portfolio: true,
      onlineBooking: true,
      smsReminders: true,
      bookingLink: true,
      windowGenerator: true,
      priorityListing: true,
      proBadge: true,
      broadcasts: true,
      multiStaff: false,
      sharedCalendar: false,
    },
  },
  {
    code: "STUDIO",
    name: "STUDIO / TEAMS",
    price: 4990,
    features: {
      profile: true,
      portfolio: true,
      onlineBooking: true,
      smsReminders: true,
      bookingLink: true,
      windowGenerator: true,
      priorityListing: true,
      proBadge: true,
      broadcasts: true,
      multiStaff: true,
      sharedCalendar: true,
    },
  },
];

async function ensureDefaultPlans() {
  const existing = await prisma.billingPlan.findMany({
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((plan) => plan.code));

  const missing = DEFAULT_PLANS.filter((plan) => !existingCodes.has(plan.code));
  if (missing.length === 0) return;

  for (const plan of missing) {
    await prisma.billingPlan.create({
      data: {
        code: plan.code,
        name: plan.name,
        price: plan.price,
        features: plan.features,
        isActive: true,
      },
    });
  }
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  await ensureDefaultPlans();

  const plans = await prisma.billingPlan.findMany({
    orderBy: { price: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      features: true,
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

    const { id, name, price, features } = parsed.data;

    const updated = await prisma.billingPlan.update({
      where: { id },
      data: { name, price, features: features as Prisma.InputJsonValue },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        features: true,
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

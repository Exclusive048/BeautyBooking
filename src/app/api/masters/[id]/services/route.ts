import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import {
  createProviderService,
  deleteProviderService,
  listProviderServices,
  updateProviderService,
} from "@/lib/providers/services";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";

const createSchema = z.object({
  name: z.string().trim().min(1),
  durationMin: z.number().int(),
  price: z.number().int(),
});

const updateSchema = z.object({
  serviceId: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  durationMin: z.number().int().optional(),
  price: z.number().int().optional(),
  onlinePaymentEnabled: z.boolean().optional(),
});

const deleteSchema = z.object({
  serviceId: z.string().min(1),
});

async function ensureMasterOwner(providerId: string, userId: string) {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, ownerUserId: true, studioId: true },
  });

  if (!provider || provider.type !== ProviderType.MASTER) {
    return fail("Master not found", 404, "MASTER_NOT_FOUND");
  }

  if (provider.ownerUserId !== userId) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  if (provider.studioId) {
    return fail("Master belongs to studio", 409, "MASTER_IN_STUDIO");
  }

  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const result = await listProviderServices(p.id);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ services: result.data });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await createProviderService(p.id, parsed.data);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ service: result.data }, { status: 201 });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  if (parsed.data.onlinePaymentEnabled === true) {
    const plan = await getCurrentPlan(auth.user.id);
    if (!plan.features.onlinePayments) {
      return fail("Feature not available", 403, "FEATURE_GATE", {
        feature: "onlinePayments",
        requiredPlan: "PRO",
      });
    }
    if (!plan.system.onlinePaymentsEnabled) {
      return fail("Feature disabled by system", 403, "SYSTEM_FEATURE_DISABLED", {
        feature: "onlinePayments",
      });
    }
  }

  const { serviceId, ...input } = parsed.data;
  const result = await updateProviderService(p.id, serviceId, input);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ service: result.data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await deleteProviderService(p.id, parsed.data.serviceId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ id: result.data.id });
}

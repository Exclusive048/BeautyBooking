import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import {
  createProviderService,
  listProviderServices,
  setProviderServiceEnabled,
  updateProviderService,
} from "@/lib/providers/services";
import { resolveGlobalMasterProvider } from "@/lib/masters/services";

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
});

const toggleSchema = z.object({
  serviceId: z.string().min(1),
  isEnabled: z.boolean(),
});

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const provider = await resolveGlobalMasterProvider(auth.user.id);
  if (!provider.ok) {
    return fail(provider.message, provider.status, provider.code);
  }

  const result = await listProviderServices(provider.data.id);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ services: result.data });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const provider = await resolveGlobalMasterProvider(auth.user.id);
  if (!provider.ok) {
    return fail(provider.message, provider.status, provider.code);
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await createProviderService(provider.data.id, parsed.data);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ service: result.data }, { status: 201 });
}

export async function PUT(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const provider = await resolveGlobalMasterProvider(auth.user.id);
  if (!provider.ok) {
    return fail(provider.message, provider.status, provider.code);
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const { serviceId, ...input } = parsed.data;
  const result = await updateProviderService(provider.data.id, serviceId, input);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ service: result.data });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const provider = await resolveGlobalMasterProvider(auth.user.id);
  if (!provider.ok) {
    return fail(provider.message, provider.status, provider.code);
  }

  const body = await req.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await setProviderServiceEnabled(
    provider.data.id,
    parsed.data.serviceId,
    parsed.data.isEnabled
  );
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ service: result.data });
}

import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { ensureStudioAccess } from "@/lib/studios/access";
import {
  listStudioMemberServices,
  resolveStudioMasterProvider,
  setStudioMemberServiceEnabled,
} from "@/lib/studios/member-services";

const toggleSchema = z.object({
  toggles: z.array(
    z.object({
      serviceId: z.string().min(1),
      enabled: z.boolean(),
    })
  ),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAccess(p.id, auth.user.id);
  if (accessError) return accessError;

  const masterProvider = await resolveStudioMasterProvider(p.id, auth.user.id);
  if (!masterProvider.ok) {
    return fail(masterProvider.message, masterProvider.status, masterProvider.code);
  }

  const result = await listStudioMemberServices(p.id, masterProvider.data.id);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ services: result.data });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAccess(p.id, auth.user.id);
  if (accessError) return accessError;

  const masterProvider = await resolveStudioMasterProvider(p.id, auth.user.id);
  if (!masterProvider.ok) {
    return fail(masterProvider.message, masterProvider.status, masterProvider.code);
  }

  const body = await req.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  for (const toggle of parsed.data.toggles) {
    const result = await setStudioMemberServiceEnabled(
      p.id,
      masterProvider.data.id,
      toggle.serviceId,
      toggle.enabled
    );
    if (!result.ok) return fail(result.message, result.status, result.code);
  }

  return ok({ updated: parsed.data.toggles.length });
}

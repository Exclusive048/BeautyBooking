import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { requireAuth } from "@/lib/auth/guards";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { ensureStudioAccess } from "@/lib/studios/access";
import { resolveStudioMasterProvider } from "@/lib/studios/member-services";
import { updateStudioMasterProfile } from "@/lib/studios/member-profile";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const updateSchema = z
  .object({
    address: z.string().trim().optional(),
  })
  .refine((data) => data.address !== undefined, {
    message: "At least one field is required",
  });

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
  const parsedParams = providerIdParamSchema.safeParse(params);
  if (!parsedParams.success) {
    return fail(formatZodError(parsedParams.error), 400, "VALIDATION_ERROR");
  }

  const { id } = parsedParams.data;
  const accessError = await ensureStudioAccess(id, auth.user.id);
  if (accessError) return accessError;

  const masterProvider = await resolveStudioMasterProvider(id, auth.user.id);
  if (!masterProvider.ok) {
    return fail(masterProvider.message, masterProvider.status, masterProvider.code);
  }

  const body = await req.json().catch(() => null);
  const parsedBody = updateSchema.safeParse(body);
  if (!parsedBody.success) {
    return fail(formatZodError(parsedBody.error), 400, "VALIDATION_ERROR");
  }

  const updated = await updateStudioMasterProfile(id, masterProvider.data.id, parsedBody.data);
  if (!updated.ok) return fail(updated.message, updated.status, updated.code);

  return ok({ profile: updated.data });
}

import { ok, fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { requireAuth } from "@/lib/auth/guards";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { ensureStudioAccess, ensureStudioAdmin } from "@/lib/studios/access";
import { getStudioProviderById, updateStudioProviderProfile } from "@/lib/studios/studio";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const updateSchema = z
  .object({
    name: z.string().trim().optional(),
    tagline: z.string().trim().optional(),
    address: z.string().trim().optional(),
    district: z.string().trim().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.tagline !== undefined ||
      data.address !== undefined ||
      data.district !== undefined,
    { message: "At least one field is required" }
  );

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
  const parsed = providerIdParamSchema.safeParse(params);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const { id } = parsed.data;
  const accessError = await ensureStudioAccess(id, auth.user.id);
  if (accessError) return accessError;

  const studio = await getStudioProviderById(id);
  if (!studio) return fail("Studio not found", 404, "STUDIO_NOT_FOUND");

  return ok({ studio });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
  const parsedParams = providerIdParamSchema.safeParse(params);
  if (!parsedParams.success) {
    return fail(formatZodError(parsedParams.error), 400, "VALIDATION_ERROR");
  }

  const { id } = parsedParams.data;
  const accessError = await ensureStudioAdmin(id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsedBody = updateSchema.safeParse(body);
  if (!parsedBody.success) {
    return fail(formatZodError(parsedBody.error), 400, "VALIDATION_ERROR");
  }

  const updated = await updateStudioProviderProfile(id, parsedBody.data);
  if (!updated) return fail("Studio not found", 404, "STUDIO_NOT_FOUND");

  return ok({ studio: updated });
}

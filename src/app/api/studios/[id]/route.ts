import { ok, fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { requireAuth } from "@/lib/auth/guards";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { ensureStudioAccess } from "@/lib/studios/access";
import { getStudioProviderById } from "@/lib/studios/studio";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

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

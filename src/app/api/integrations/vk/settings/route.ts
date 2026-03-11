import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { AppError, toAppError } from "@/lib/api/errors";
import { vkSettingsSchema } from "@/lib/vk/schemas";
import { setVkLinkEnabled } from "@/lib/vk/links";

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = vkSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const result = await setVkLinkEnabled(auth.user.id, parsed.data.enabled);
    return ok({ enabled: result.enabled });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

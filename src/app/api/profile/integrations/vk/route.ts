import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { AppError, toAppError } from "@/lib/api/errors";
import { getVkLinkSummary, setVkLinkEnabled } from "@/lib/vk/links";
import { vkSettingsSchema } from "@/lib/vk/schemas";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const status = await getVkLinkSummary(auth.user.id);
  return ok({
    linked: status.linked,
    enabled: status.enabled,
    username: status.username,
    avatarUrl: status.avatarUrl,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const enabled =
      body == null ? false : (() => {
        const parsed = vkSettingsSchema.safeParse(body);
        if (!parsed.success) {
          throw new AppError(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
        }
        return parsed.data.enabled;
      })();

    const result = await setVkLinkEnabled(auth.user.id, enabled);
    return ok({ enabled: result.enabled });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

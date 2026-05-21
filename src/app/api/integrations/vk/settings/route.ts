import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { AppError, toAppError } from "@/lib/api/errors";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { isVkNotificationsEnabled } from "@/lib/env";
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

    // VK-NOTIFICATIONS-FLAG-A: gate enable-attempts at the system level.
    // Delivery channel is not wired in `notifications/delivery.ts` yet —
    // accepting an enable would create a no-op subscription that
    // misleads the user. Mirrors the existing «silent skip when plan
    // feature is off» pattern below: just return disabled state. When
    // the subsystem ships, flip `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED`
    // — no further code change.
    if (parsed.data.enabled && !isVkNotificationsEnabled) {
      return ok({ enabled: false });
    }

    // Silent skip: if trying to enable but feature not available on plan, return disabled state.
    if (parsed.data.enabled) {
      const plan = await getCurrentPlan(auth.user.id);
      if (!plan.features.vkNotifications) {
        return ok({ enabled: false });
      }
    }

    const result = await setVkLinkEnabled(auth.user.id, parsed.data.enabled);
    return ok({ enabled: result.enabled });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
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

    // VK-COMMUNITY-NOTIFY-01: канал доставки есть (`vk/notify.ts`), и он для
    // всех — без тарифа (решение владельца 2026-09-24). Прежние гейты
    // «подсистема не готова» и «нет в тарифе» сняты; остался только «ВК не
    // привязан» внутри `setVkLinkEnabled`.
    const result = await setVkLinkEnabled(auth.user.id, parsed.data.enabled);
    return ok({ enabled: result.enabled });
  } catch (error) {
    const appError = toAuthSurfaceError(error);
    // SECURITY-EXPOSURE-AUDIT-01 · Y9 / FIX-B14: граница auth не отдаёт `AppError.details`.
    return fail(appError.message, appError.status, appError.code);
  }
}

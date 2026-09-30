import "server-only";
import { jsonFail } from "@/lib/api/contracts";
import { checkRateLimit, type RateLimitKey } from "@/lib/rate-limit";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";

/**
 * GUEST-MANAGE-LINK — общий лимит мутаций по ссылке «Управлять записью».
 * Шаблоны `…/manage/:id/{cancel,reschedule,review}` — в точном списке
 * чувствительных (`SENSITIVE_ROUTE_TEMPLATES`, 29.09 доработки · 15): при обрыве
 * Redis действия по ссылке отказывают (fail-closed, инв. #6), как и остальные
 * гостевые пишущие пути. У каждого действия своё ведро (ключ несёт шаблон пути). Подбор токена лимит не сторожит (HMAC не
 * подбирается) — он держит повторы и шум.
 */
const GUEST_MANAGE_RATE = { limit: 20, windowSeconds: 600 };

/** `key` строит роут (`routeRateLimitKey(req, "ip", …)`): шаблон пути — из запроса. */
export async function guestManageRateLimitRefusal(key: RateLimitKey): Promise<Response | null> {
  const result = await checkRateLimit(key, {
    maxRequests: GUEST_MANAGE_RATE.limit,
    windowSeconds: GUEST_MANAGE_RATE.windowSeconds,
  });
  const refusal = resolveRateLimitRefusal(result);
  return refusal ? jsonFail(refusal.status, refusal.message, refusal.code) : null;
}

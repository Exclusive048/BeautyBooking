import "server-only";
import { jsonFail } from "@/lib/api/contracts";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";

/**
 * GUEST-MANAGE-LINK — общий лимит мутаций по ссылке «Управлять записью».
 * Ключ `rate:guestManage:` внесён в `SENSITIVE_KEY_PREFIXES`: при обрыве Redis
 * отмена и перенос по ссылке отказывают (fail-closed, инв. #6), как и
 * остальные гостевые пишущие пути. Подбор токена лимит не сторожит (HMAC не
 * подбирается) — он держит повторы и шум.
 */
const GUEST_MANAGE_RATE = { limit: 20, windowSeconds: 600 };

/**
 * `key` роут передаёт литералом (`rate:guestManage:ip:…`): детектор fail-open
 * (`sensitive-fail-open-triage.test.ts`) узнаёт fail-closed по ключу в исходнике
 * САМОГО роута.
 */
export async function guestManageRateLimitRefusal(key: string): Promise<Response | null> {
  const result = await checkRateLimit(key, {
    maxRequests: GUEST_MANAGE_RATE.limit,
    windowSeconds: GUEST_MANAGE_RATE.windowSeconds,
  });
  const refusal = resolveRateLimitRefusal(result);
  return refusal ? jsonFail(refusal.status, refusal.message, refusal.code) : null;
}

import { z } from "zod";
import { logError } from "@/lib/logging/logger";
import { ok, fail } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";
import { readBodyTextCapped } from "@/lib/http/body-limit";
import { getClientIp } from "@/lib/http/ip";

export const runtime = "nodejs";

const schema = z.object({
  message: z.string().max(500).optional(),
  digest: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
  userAgent: z.string().max(500).optional(),
});

// 20 client errors per minute per IP — prevents log flooding
const RATE_WINDOW = 60;
const RATE_MAX = 20;

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    // SECURITY-EXPOSURE-AUDIT-01 · Y2: здесь читали `true`-«разрешено» legacy-
    // перегрузки как «ограничено». Перегрузки больше нет (29.09 доработки · 15):
    // ответ несёт причину, отказ — через общий `resolveRateLimitRefusal`.
    const refusal = resolveRateLimitRefusal(
      await checkRateLimit(routeRateLimitKey(req, "ip", ip), { maxRequests: RATE_MAX, windowSeconds: RATE_WINDOW }),
    );
    if (refusal) {
      return fail(refusal.message, refusal.status, refusal.code);
    }

    // SEC-16: Zod ограничивает поля только ПОСЛЕ разбора — граница размера
    // обязана стоять до него.
    const read = await readBodyTextCapped(req);
    if (!read.ok) {
      return fail("Слишком большой запрос.", 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(read.text) as unknown;
    } catch {
      return fail("Некорректный формат запроса.", 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("Проверьте правильность заполнения полей.", 400);
    }

    const { message, digest, url, userAgent } = parsed.data;

    logError("[client-error-boundary]", {
      message: message ?? "(no message)",
      digest,
      url,
      userAgent,
    });

    return ok({});
  } catch (err) {
    logError("log-error endpoint failed", { err });
    return ok({});
  }
}

import { z } from "zod";
import { logError } from "@/lib/logging/logger";
import { ok, fail } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
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
    // The legacy 3-arg checkRateLimit overload returns `true` = ALLOWED. This
    // previously read the result as `isLimited`, inverting the check: the first
    // 20 reports/min were rejected and everything past the limit was accepted
    // (SECURITY-EXPOSURE-AUDIT-01 · Y2). Guard on `!allowed`.
    const allowed = await checkRateLimit(`log-error:${ip}`, RATE_MAX, RATE_WINDOW);
    if (!allowed) {
      return fail("Слишком много запросов. Попробуйте позже.", 429);
    }

    let body: unknown;
    try {
      body = await req.json();
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

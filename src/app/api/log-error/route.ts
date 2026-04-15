import { z } from "zod";
import { logError } from "@/lib/logging/logger";
import { ok, fail } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";

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

function getIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: Request) {
  try {
    const ip = getIp(req);
    const isLimited = await checkRateLimit(`log-error:${ip}`, RATE_MAX, RATE_WINDOW);
    if (isLimited) {
      return fail("Too many requests", 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON", 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("Invalid payload", 400);
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

import crypto from "crypto";
import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { deleteMasterCabinet } from "@/lib/deletion/delete-master";

export const runtime = "nodejs";

const RATE_LIMIT = 1;
const RATE_WINDOW_SECONDS = 60 * 60;

function getFirstIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const ip = getFirstIp(req);
  const ipKey = `delete-master:ip:${hashKey(ip ?? "unknown")}`;
  const ipAllowed = await checkRateLimit(ipKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!ipAllowed) {
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  const userKey = `delete-master:user:${hashKey(auth.user.id)}`;
  const userAllowed = await checkRateLimit(userKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!userAllowed) {
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  try {
    await deleteMasterCabinet(auth.user.id);
    return ok({ deleted: true });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    if (appError.code === "ACTIVE_BOOKINGS") {
      return fail("Есть активные записи", 409, "ACTIVE_BOOKINGS", appError.details);
    }
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

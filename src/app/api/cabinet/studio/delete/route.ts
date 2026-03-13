import crypto from "crypto";
import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { deleteStudioCabinet } from "@/lib/deletion/delete-studio";

export const runtime = "nodejs";

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
  const ipKey = `rl:/api/cabinet/studio/delete/ip:${hashKey(ip ?? "unknown")}`;
  const ipRateLimit = await checkRateLimit(ipKey, RATE_LIMITS.destructiveDelete);
  if (ipRateLimit.limited) {
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  const userKey = `rl:/api/cabinet/studio/delete/user:${hashKey(auth.user.id)}`;
  const userRateLimit = await checkRateLimit(userKey, RATE_LIMITS.destructiveDelete);
  if (userRateLimit.limited) {
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  try {
    await deleteStudioCabinet(auth.user.id);
    return ok({ deleted: true });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    if (appError.code === "ACTIVE_BOOKINGS") {
      return fail("Есть активные записи", 409, "ACTIVE_BOOKINGS", appError.details);
    }
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

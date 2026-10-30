import { toAppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { markWelcomeSeen } from "@/lib/onboarding/welcome-seen";
import { invalidateMeIdentityCache } from "@/lib/users/me";

/**
 * WELCOME-DIALOG-01 — человек закрыл приветствие этапа тестирования.
 * Ставит `UserProfile.welcomeSeenAt` (идемпотентно) и сбрасывает кэш `/api/me`,
 * чтобы окно не вернулось на следующей странице.
 *
 * ERROR-ENVELOPE-NEW-ROUTES: сбой БД — конверт `{ ok:false, error }` и строка
 * `logError` с маршрутом, а не HTML-страница 500 Next.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    await markWelcomeSeen(auth.user.id);
    await invalidateMeIdentityCache(auth.user.id);
    return ok({ ok: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/me/welcome failed", {
        requestId: getRequestId(req),
        route: "POST /api/me/welcome",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

import { z } from "zod";
import { toAppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { withRequestContext } from "@/lib/api/with-request-context";
import { matchesPkceS256Challenge } from "@/lib/auth/mobile-oauth-flow";
import { takeMobileOAuthCode } from "@/lib/auth/mobile-oauth-store";
import { respondWithMobileSession } from "@/lib/auth/mobile-session";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { prisma } from "@/lib/prisma";

/**
 * MOBILE-AUTH-A2 — обмен одноразового кода OAuth-входа на сессию приложения.
 *
 * Код выдал колбэк VK ID / Яндекс ID (`masterryadom://auth/callback?code=…`):
 * 60 секунд, один раз, под PKCE-челлендж, который приложение передало на
 * старте. Здесь приложение предъявляет код и свой verifier и получает то же,
 * что после OTP-входа: `{ tokens, user }`, новую семью сессий с метой
 * устройства, `no-store`, без `Set-Cookie`.
 *
 * Код сгорает при ЛЮБОМ исходе (`GETDEL` до проверки verifier'а): подбор
 * verifier'а к перехваченному коду даёт ровно одну попытку. Все отказы по коду —
 * один ответ `400 OAUTH_CODE_INVALID`: по нему нельзя отличить «нет такого»,
 * «протух», «использован» и «не тот verifier».
 */

const bodySchema = z.object({
  code: z.string().trim().min(1).max(256),
  codeVerifier: z.string().trim().min(1).max(256),
});

function codeInvalid(req: Request, reason: string) {
  // Ни кода, ни verifier'а в логе: только причина — для разбора, не для ответа.
  logInfo("Mobile OAuth code exchange refused", { requestId: getRequestId(req), reason });
  void recordSurfaceEvent({
    surface: "auth",
    outcome: "failure",
    operation: "mobile-oauth-exchange",
    code: "OAUTH_CODE_INVALID",
  });
  return fail("Не удалось войти. Попробуйте ещё раз.", 400, "OAUTH_CODE_INVALID");
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    try {
      const record = await takeMobileOAuthCode(parsed.data.code);
      if (!record) {
        return codeInvalid(req, "unknown_or_used");
      }
      if (!matchesPkceS256Challenge(parsed.data.codeVerifier, record.codeChallenge)) {
        return codeInvalid(req, "pkce_mismatch");
      }

      // Пользователь мог исчезнуть за эти секунды (удаление аккаунта) — сессия
      // удалённому не выдаётся, а ответ тот же, что у битого кода.
      const user = await prisma.userProfile.findFirst({
        where: { id: record.userId, isDeleted: false },
        select: { id: true, phone: true, roles: true },
      });
      if (!user) {
        return codeInvalid(req, "user_gone");
      }

      void recordSurfaceEvent({
        surface: "auth",
        outcome: "success",
        operation: `mobile-oauth-${record.provider}-exchange`,
      });
      return await respondWithMobileSession(req, user);
    } catch (error) {
      // Redis недоступен — код не проверить (fail-closed, `mobile-oauth-store.ts`).
      const appError = toAppError(error);
      if (appError.status === 503) {
        return fail("Сервис временно недоступен. Попробуйте позже.", 503, "SERVICE_UNAVAILABLE");
      }
      logError("POST /api/mobile/v1/auth/oauth/exchange failed", {
        requestId: getRequestId(req),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return fail("Не удалось войти. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
    }
  });
}

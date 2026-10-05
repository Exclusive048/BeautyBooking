import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { withRequestContext } from "@/lib/api/with-request-context";
import { issueMobileOAuthLinkIntent } from "@/lib/auth/mobile-oauth-store";
import { MOBILE_NO_STORE_INIT } from "@/lib/auth/mobile-session";
import { isOAuthLoginProviderEnabled, parseOAuthLoginProvider } from "@/lib/auth/oauth-providers";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * MOBILE-AUTH-A2 — «Привязать VK ID / Яндекс ID» из приложения.
 *
 * Привязка идёт через системный браузер, где сессии приложения нет (а куки
 * Chrome могут нести веб-сессию другого человека). Поэтому уже вошедшее
 * приложение (Bearer) сначала берёт здесь одноразовый `intent` — 5 минут,
 * привязан к пользователю и провайдеру — и открывает
 * `/api/mobile/v1/auth/oauth/{provider}/start?codeChallenge=…&intent=…`.
 * Колбэк привяжет аккаунт провайдера к ЭТОМУ пользователю и вернёт
 * `masterryadom://auth/callback?linked=<provider>`.
 *
 * Лимит — тир `mobileAuth` прокси (POST под `/api/mobile/v1/auth/`).
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  return withRequestContext(req, async () => {
    const user = await getSessionUser();
    if (!user) {
      return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
    }

    const provider = parseOAuthLoginProvider((await ctx.params).provider);
    if (!provider) {
      return fail("Такой способ входа не поддерживается.", 404, "NOT_FOUND");
    }
    // AUTH-KILLSWITCH-ENFORCE-01: выключенный провайдер не начинает и привязку.
    if (!isOAuthLoginProviderEnabled(provider)) {
      return fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE");
    }

    try {
      const intent = await issueMobileOAuthLinkIntent({ userId: user.id, provider });
      return ok({ intent }, MOBILE_NO_STORE_INIT);
    } catch (error) {
      // Без Redis intent не выдать (`mobile-oauth-store.ts`: fail-closed) — 503;
      // прочее — 500. Причина — в лог, наружу — только текст.
      logError("POST /api/mobile/v1/auth/oauth/[provider]/link-intent failed", {
        requestId: getRequestId(req),
        provider,
        stack: error instanceof Error ? error.stack : undefined,
      });
      const unavailable = toAppError(error).status === 503;
      return fail(
        "Не удалось начать привязку. Попробуйте ещё раз.",
        unavailable ? 503 : 500,
        unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
      );
    }
  });
}

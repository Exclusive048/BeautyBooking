import { cookies } from "next/headers";
import { z } from "zod";
import { withRequestContext } from "@/lib/api/with-request-context";
import { setMobileOAuthFlowCookie, PKCE_S256_CHALLENGE_PATTERN } from "@/lib/auth/mobile-oauth-flow";
import { takeMobileOAuthLinkIntent } from "@/lib/auth/mobile-oauth-store";
import {
  beginOAuthAuthorization,
  isOAuthLoginProviderEnabled,
  OAUTH_NOT_CONFIGURED_CODES,
  parseOAuthLoginProvider,
} from "@/lib/auth/oauth-providers";
import {
  classifyOAuthStartFailure,
  logOAuthStartFailure,
  oauthStartProviderRedirect,
  type OAuthStartNavigation,
} from "@/lib/auth/oauth-start-error";
import { consentFlagsFromParams, hasRequiredConsents } from "@/lib/legal/consent-flags";
import { mobileAuthCallbackRedirect } from "@/lib/mobile/app-redirect";
import type { NextResponse } from "next/server";

/**
 * MOBILE-AUTH-A2 — старт входа через VK ID / Яндекс ID из нативного приложения.
 *
 * Приложение открывает этот адрес в системном браузере (iOS
 * `ASWebAuthenticationSession`, Android Custom Tabs). Старт ставит ровно те же
 * куки, что веб-старт (`beginOAuthAuthorization`: согласия, state, verifier —
 * колбэк у них общий), плюс подписанную куку мобильного флоу
 * `{ codeChallenge, linkUserId }`, привязанную к state (`mobile-oauth-flow.ts`).
 * По ней колбэк отдаёт приложению одноразовый код вместо кук сессии.
 *
 * Два PKCE, и это не дублирование: verifier провайдера живёт в куке браузера
 * (сервер ↔ VK/Яндекс), а `codeChallenge` — приложения: одноразовый код
 * обменяет только тот, у кого его verifier (`/oauth/exchange`), то есть не
 * другое приложение, перехватившее переход на схему `masterryadom://`.
 *
 * Сессия браузера НЕ читается: Custom Tabs делят куки с Chrome, и там может
 * жить веб-сессия другого человека. Поэтому привязка к аккаунту приложения —
 * только через `intent` (одноразовый токен `/oauth/{provider}/link-intent`),
 * и только с ним вход обходится без согласий (связка никого не регистрирует —
 * то же правило, что у веба, RKN-FIX-01).
 *
 * Любой исход — навигация: успех уводит к провайдеру, отказ — в приложение
 * (`masterryadom://auth/callback?error=<код>`). JSON-конверт в системном
 * браузере был бы тупиком.
 */

const querySchema = z.object({
  codeChallenge: z.string().regex(PKCE_S256_CHALLENGE_PATTERN),
  intent: z.string().trim().min(1).max(256).optional(),
});

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<OAuthStartNavigation | NextResponse> {
  return withRequestContext(req, async () => {
    const provider = parseOAuthLoginProvider((await ctx.params).provider);
    if (!provider) {
      return mobileAuthCallbackRedirect({ error: "invalid_request" });
    }

    // AUTH-KILLSWITCH-ENFORCE-01 — тот же флаг, что у веб-старта, и до всего.
    if (!isOAuthLoginProviderEnabled(provider)) {
      return mobileAuthCallbackRedirect({ error: "provider_unavailable" });
    }

    const searchParams = new URL(req.url).searchParams;
    const parsed = querySchema.safeParse({
      codeChallenge: searchParams.get("codeChallenge") ?? undefined,
      intent: searchParams.get("intent") || undefined,
    });
    if (!parsed.success) {
      return mobileAuthCallbackRedirect({ error: "invalid_request" });
    }
    const { codeChallenge, intent } = parsed.data;
    const consentFlags = consentFlagsFromParams(searchParams);

    try {
      // Привязка: intent одноразовый и гасится здесь же — повтор старта с тем
      // же токеном получает `intent_invalid`, а не вторую связку.
      let linkUserId: string | null = null;
      if (intent) {
        const record = await takeMobileOAuthLinkIntent(intent);
        if (!record || record.provider !== provider) {
          return mobileAuthCallbackRedirect({ error: "intent_invalid" });
        }
        linkUserId = record.userId;
      } else if (!hasRequiredConsents(consentFlags)) {
        // RKN-FIX-01: вход может создать аккаунт — без согласий не начинаем.
        return mobileAuthCallbackRedirect({ error: "consent_required" });
      }

      const { authorizeUrl, state } = await beginOAuthAuthorization(provider, consentFlags);
      setMobileOAuthFlowCookie(await cookies(), { state, provider, codeChallenge, linkUserId });
      return oauthStartProviderRedirect(authorizeUrl);
    } catch (error) {
      // Не сконфигурирован → `provider_unavailable`, прочее (в т.ч. Redis) →
      // `start_failed`; диагностика — в лог со скрабом, как у веб-старта.
      logOAuthStartFailure(req, error);
      return mobileAuthCallbackRedirect({
        error: classifyOAuthStartFailure(error, OAUTH_NOT_CONFIGURED_CODES[provider]) === "provider_unavailable"
          ? "provider_unavailable"
          : "start_failed",
      });
    }
  });
}

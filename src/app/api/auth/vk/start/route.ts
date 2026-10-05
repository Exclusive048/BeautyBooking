import { withRequestContext } from "@/lib/api/with-request-context";
import {
  cabinetRefererPath,
  classifyOAuthStartFailure,
  isCabinetReferer,
  logOAuthStartFailure,
  oauthStartCabinetRedirect,
  oauthStartLoginRedirect,
  type OAuthStartFailure,
  oauthStartProviderRedirect,
  type OAuthStartNavigation,
} from "@/lib/auth/oauth-start-error";
import { getSessionUser } from "@/lib/auth/session";
import { PHONE_VERIFY_START_PARAM, rememberPhoneVerifyReturn } from "@/lib/auth/phone-verify-return";
import { beginOAuthAuthorization, OAUTH_NOT_CONFIGURED_CODES } from "@/lib/auth/oauth-providers";
import { consentFlagsFromParams, hasRequiredConsents } from "@/lib/legal/consent-flags";
import { isVkAuthEnabled } from "@/lib/env";

const VK_NOT_CONFIGURED_CODES = OAUTH_NOT_CONFIGURED_CODES.vk;

/**
 * FIX-D1 — куда вернуть браузер при отказе.
 *
 * Кнопка «Подключить VK» есть в ДВУХ местах, и адрес отказа у них разный:
 *   · `/login` — там кнопка входа, и `/login?error=` есть правильный адрес;
 *   · клиентский кабинет (`client-profile-page.tsx` → `window.location.href =
 *     "/api/auth/vk/start"`) — пользователь УЖЕ вошёл, и отправлять его на
 *     страницу входа значит показывать тупик вместо объяснения.
 *
 * До FIX-D1 второй случай уходил на `/login?error=`; SMOKE-02 · Ф-1 намерил это
 * с другой стороны — `?vk=` на странице профиля не снимался, потому что его
 * туда никто не ставил.
 */
function backToStartSurface(req: Request, failure: OAuthStartFailure): OAuthStartNavigation {
  return isCabinetReferer(req)
    ? oauthStartCabinetRedirect(req, failure, "vk")
    : oauthStartLoginRedirect(req, failure);
}

export async function GET(req: Request): Promise<OAuthStartNavigation> {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: refuse when the provider is disabled
    // server-side (FZ-199 kill-switch), before any cred read / OAuth work —
    // a flag-off provider with creds present must not initiate the flow.
    //
    // FIX-B14: отказ по-прежнему происходит здесь и до всего; изменилась только
    // его ФОРМА — навигация возвращается на `/login`, а не в JSON-тупик.
    if (!isVkAuthEnabled) {
      return backToStartSurface(req, "provider_unavailable");
    }

    // RKN-FIX-01: the consent the visitor ticked on /login travels with the
    // flow. It is validated HERE (before any OAuth work) and then signed into a
    // state-bound cookie the callback can trust — see `oauth-consent-cookie.ts`
    // for why that, and not a query param on the callback, is the trustworthy
    // vehicle in this codebase.
    //
    // A session-linking round-trip (an already-signed-in user attaching VK)
    // carries no flags and needs none: it registers nobody. So the refusal is
    // scoped to visitors who could end up creating an account.
    const consentFlags = consentFlagsFromParams(new URL(req.url).searchParams);
    const isLinkingSession = Boolean(await getSessionUser());
    if (!isLinkingSession && !hasRequiredConsents(consentFlags)) {
      return backToStartSurface(req, "consent_required");
    }

    try {
      // state + PKCE + три подписанные куки (согласия, state, verifier) — общий
      // с мобильным стартом `beginOAuthAuthorization` (MOBILE-AUTH-A2): колбэк
      // у них один и читает ровно эти куки.
      const { authorizeUrl: authUrl } = await beginOAuthAuthorization("vk", consentFlags);

      // PHONE-OAUTH-PROOF-01: вход из кнопки «Подтвердить номер» в кабинете —
      // колбэк вернёт на ту же страницу с итогом (`phone-verify-return.ts`).
      if (isLinkingSession && new URL(req.url).searchParams.get(PHONE_VERIFY_START_PARAM) === "1") {
        await rememberPhoneVerifyReturn(cabinetRefererPath(req));
      }

      return oauthStartProviderRedirect(authUrl);
    } catch (error) {
      // FIX-B14: раньше здесь было два разных ответа — 503 для «не
      // сконфигурирован» и общий `fail(...)` с `appError.details`. Второй ещё и
      // тащил наружу payload ошибки, который SECURITY-EXPOSURE-AUDIT-01 · Y9
      // намеренно снял с колбэков; на старте это осталось незамеченным.
      // Оба исхода теперь навигация, а диагностика уезжает в лог со скрабом.
      // FIX-D1: тот же выбор адреса, что и у двух исходов выше — иначе
      // `start_failed` из кабинета продолжал бы уводить на `/login`.
      logOAuthStartFailure(req, error);
      return backToStartSurface(req, classifyOAuthStartFailure(error, VK_NOT_CONFIGURED_CODES));
    }
  });
}

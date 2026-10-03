import { withRequestContext } from "@/lib/api/with-request-context";
import {
  cabinetRefererPath,
  failOAuthStart,
  oauthStartLoginRedirect,
  oauthStartProviderRedirect,
  type OAuthStartNavigation,
} from "@/lib/auth/oauth-start-error";
import { getSessionUser } from "@/lib/auth/session";
import { PHONE_VERIFY_START_PARAM, rememberPhoneVerifyReturn } from "@/lib/auth/phone-verify-return";
import { beginOAuthAuthorization, OAUTH_NOT_CONFIGURED_CODES } from "@/lib/auth/oauth-providers";
import { consentFlagsFromParams, hasRequiredConsents } from "@/lib/legal/consent-flags";
import { isYandexAuthEnabled } from "@/lib/env";

// FIX-YANDEX-OAUTH — start route, bespoke-parallel to api/auth/vk/start.
const YANDEX_NOT_CONFIGURED_CODES = OAUTH_NOT_CONFIGURED_CODES.yandex;

export async function GET(req: Request): Promise<OAuthStartNavigation> {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: refuse when Yandex auth is disabled
    // server-side (FZ-199 kill-switch), before any cred read / OAuth work.
    // FIX-B14: та же форма ответа, что у VK-близнеца — навигация, не JSON.
    if (!isYandexAuthEnabled) {
      return oauthStartLoginRedirect(req, "provider_unavailable");
    }

    // RKN-FIX-01 — identical consent capture to the VK start route (see there
    // for the rationale); linking an already-signed-in account needs no flags.
    const consentFlags = consentFlagsFromParams(new URL(req.url).searchParams);
    const isLinkingSession = Boolean(await getSessionUser());
    if (!isLinkingSession && !hasRequiredConsents(consentFlags)) {
      return oauthStartLoginRedirect(req, "consent_required");
    }

    try {
      // state + PKCE + три подписанные куки (согласия, state, verifier) — общий
      // с мобильным стартом `beginOAuthAuthorization` (MOBILE-AUTH-A2).
      const { authorizeUrl: authUrl } = await beginOAuthAuthorization("yandex", consentFlags);

      // PHONE-OAUTH-PROOF-01: вход из кнопки «Подтвердить номер» в кабинете —
      // колбэк вернёт на ту же страницу с итогом (`phone-verify-return.ts`).
      if (isLinkingSession && new URL(req.url).searchParams.get(PHONE_VERIFY_START_PARAM) === "1") {
        await rememberPhoneVerifyReturn(cabinetRefererPath(req));
      }

      return oauthStartProviderRedirect(authUrl);
    } catch (error) {
      // FIX-B14 — см. VK-близнец: оба исхода навигация, `details` в ответ не
      // уезжает (Y9), диагностика — в лог со скрабом.
      return failOAuthStart(req, error, YANDEX_NOT_CONFIGURED_CODES);
    }
  });
}

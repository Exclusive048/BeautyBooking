import crypto from "crypto";
import { cookies } from "next/headers";
import { isProduction, isVkAuthEnabled, isYandexAuthEnabled } from "@/lib/env";
import type { ConsentFlags } from "@/lib/legal/consent-flags";
import {
  signConsentCookieValue,
  VK_CONSENT_COOKIE,
  YANDEX_CONSENT_COOKIE,
} from "@/lib/legal/oauth-consent-cookie";
import { signVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_STATE_TTL_SECONDS, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { buildVkAuthorizeUrl, requireVkRedirectUri } from "@/lib/vk/oauth";
import {
  generateCodeChallenge as generateVkCodeChallenge,
  generateCodeVerifier as generateVkCodeVerifier,
} from "@/lib/vk/pkce";
import {
  signYandexCookieValue,
  YANDEX_STATE_COOKIE,
  YANDEX_STATE_TTL_SECONDS,
  YANDEX_VERIFIER_COOKIE,
} from "@/lib/yandex/cookies";
import { buildYandexAuthorizeUrl, requireYandexRedirectUri } from "@/lib/yandex/oauth";
import {
  generateCodeChallenge as generateYandexCodeChallenge,
  generateCodeVerifier as generateYandexCodeVerifier,
} from "@/lib/yandex/pkce";

/**
 * MOBILE-AUTH-A2 — OAuth-провайдеры входа (VK ID, Яндекс ID) как одно понятие.
 *
 * Веб-ноги (`/api/auth/{vk,yandex}/*`) писались близнецами (FIX-YANDEX-OAUTH:
 * «bespoke-parallel»), и у каждой свой набор кук. Мобильный старт обязан
 * ставить РОВНО те же куки, что веб: колбэк у них общий (redirect_uri в
 * консолях VK/Яндекса один), и читает он именно их. Поэтому начало авторизации
 * вынесено сюда и его зовут все три старта — веб-VK, веб-Яндекс и мобильный.
 */

export const OAUTH_LOGIN_PROVIDERS = ["vk", "yandex"] as const;

export type OAuthLoginProvider = (typeof OAUTH_LOGIN_PROVIDERS)[number];

export function parseOAuthLoginProvider(value: unknown): OAuthLoginProvider | null {
  return OAUTH_LOGIN_PROVIDERS.find((provider) => provider === value) ?? null;
}

/** AUTH-KILLSWITCH-ENFORCE-01: тот же флаг, что гейтит веб-старт и колбэк. */
export function isOAuthLoginProviderEnabled(provider: OAuthLoginProvider): boolean {
  return provider === "vk" ? isVkAuthEnabled : isYandexAuthEnabled;
}

/**
 * Коды «провайдер не сконфигурирован» — по ним отказ старта читается как
 * `provider_unavailable`, а не `start_failed` (`classifyOAuthStartFailure`).
 */
export const OAUTH_NOT_CONFIGURED_CODES: Record<OAuthLoginProvider, ReadonlySet<string>> = {
  vk: new Set([
    "VK_CLIENT_ID_MISSING",
    "VK_CLIENT_SECRET_MISSING",
    "VK_REDIRECT_URI_MISSING",
    "VK_ID_CLIENT_ID_MISSING",
    "VK_ID_CLIENT_SECRET_MISSING",
    "VK_ID_REDIRECT_URI_MISSING",
  ]),
  yandex: new Set(["YANDEX_CLIENT_ID_MISSING", "YANDEX_CLIENT_SECRET_MISSING", "YANDEX_REDIRECT_URI_MISSING"]),
};

/** Жизнь state/verifier/согласий одного флоу — те же 10 минут, что у кук провайдера. */
export function oauthFlowTtlSeconds(provider: OAuthLoginProvider): number {
  return provider === "vk" ? VK_ID_STATE_TTL_SECONDS : YANDEX_STATE_TTL_SECONDS;
}

export function oauthFlowCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge,
  };
}

export type OAuthAuthorization = {
  /** Адрес авторизации провайдера — туда уходит браузер. */
  authorizeUrl: string;
  /** CSRF-nonce флоу: к нему привязаны куки согласий и мобильного флоу. */
  state: string;
};

/**
 * Начало авторизации: state + PKCE (сервер ↔ провайдер), адрес авторизации и
 * три подписанные куки — согласия (RKN-FIX-01, привязаны к state), state,
 * verifier. Порядок и атрибуты кук — ровно те, что веб-старты ставили сами до
 * выноса.
 *
 * Бросает `AppError` от `require*RedirectUri` / `build*AuthorizeUrl`, если
 * провайдер не сконфигурирован, — классифицирует вызывающий.
 */
export async function beginOAuthAuthorization(
  provider: OAuthLoginProvider,
  consentFlags: ConsentFlags,
): Promise<OAuthAuthorization> {
  const state = crypto.randomBytes(32).toString("hex");

  if (provider === "vk") {
    const codeVerifier = generateVkCodeVerifier();
    const codeChallenge = generateVkCodeChallenge(codeVerifier);
    const redirectUri = requireVkRedirectUri("auth");
    const authorizeUrl = buildVkAuthorizeUrl({ state, codeChallenge, redirectUri });

    const cookieStore = await cookies();
    const options = oauthFlowCookieOptions(oauthFlowTtlSeconds("vk"));
    cookieStore.set(VK_CONSENT_COOKIE, signConsentCookieValue(state, consentFlags), options);
    cookieStore.set(VK_ID_STATE_COOKIE, signVkCookieValue(state), options);
    cookieStore.set(VK_ID_VERIFIER_COOKIE, signVkCookieValue(codeVerifier), options);
    return { authorizeUrl, state };
  }

  const codeVerifier = generateYandexCodeVerifier();
  const codeChallenge = generateYandexCodeChallenge(codeVerifier);
  const redirectUri = requireYandexRedirectUri();
  const authorizeUrl = buildYandexAuthorizeUrl({ state, codeChallenge, redirectUri });

  const cookieStore = await cookies();
  const options = oauthFlowCookieOptions(oauthFlowTtlSeconds("yandex"));
  cookieStore.set(YANDEX_CONSENT_COOKIE, signConsentCookieValue(state, consentFlags), options);
  cookieStore.set(YANDEX_STATE_COOKIE, signYandexCookieValue(state), options);
  cookieStore.set(YANDEX_VERIFIER_COOKIE, signYandexCookieValue(codeVerifier), options);
  return { authorizeUrl, state };
}

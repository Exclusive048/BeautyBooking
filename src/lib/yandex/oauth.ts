import { AppError } from "@/lib/api/errors";
import { getYandexClientId, getYandexClientSecret, getYandexRedirectUri } from "@/lib/yandex/config";

// FIX-YANDEX-OAUTH — Yandex ID OAuth2 (authorization-code + PKCE), bespoke-
// parallel to src/lib/vk/oauth.ts. Login-only surface (no token-refresh /
// logout — VK has those for its notifications subsystem, which Yandex doesn't
// have; "don't over-build", match VK's *login* surface).
//
// Endpoints — https://yandex.ru/dev/id/doc/en/
const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
/**
 * RES-09 — верхняя граница обмена с Яндекс ID. Причина та же, что у
 * VK-близнеца: оба вызова стоят в callback'е авторизации и держат запрос
 * пользователя, пока мы ходим за токеном и профилем.
 */
const OAUTH_REQUEST_TIMEOUT_MS = 10_000;
const YANDEX_USER_INFO_URL = "https://login.yandex.ru/info?format=json";

type YandexTokenSuccess = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type YandexTokenError = {
  error: string;
  error_description?: string;
};

type YandexTokenResponse = YandexTokenSuccess | YandexTokenError;

type YandexUserInfoResponse = {
  id?: string;
  default_email?: string;
  emails?: string[];
  first_name?: string;
  last_name?: string;
  display_name?: string;
  real_name?: string;
  default_phone?: { number?: string };
  is_avatar_empty?: boolean;
  default_avatar_id?: string;
  error?: string;
  error_description?: string;
};

export type YandexTokenPayload = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
};

export type YandexProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export function requireYandexRedirectUri(): string {
  const redirectUri = getYandexRedirectUri();
  if (!redirectUri) {
    throw new AppError("Не настроен YANDEX_OAUTH_REDIRECT_URI.", 500, "YANDEX_REDIRECT_URI_MISSING");
  }
  return redirectUri.trim();
}

export function buildYandexAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const clientId = getYandexClientId();
  if (!clientId) {
    throw new AppError("Не настроен YANDEX_OAUTH_CLIENT_ID.", 500, "YANDEX_CLIENT_ID_MISSING");
  }

  const url = new URL(YANDEX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Scopes (login:info / login:email / login:avatar) are granted at the Yandex
  // OAuth app level; not passed here (matches Yandex ID recommendation).
  return url.toString();
}

function resolveTokenError(error: YandexTokenError): AppError {
  if (error.error === "invalid_grant") {
    return new AppError("Код авторизации недействителен", 400, "YANDEX_INVALID_GRANT", error);
  }
  return new AppError(error.error_description ?? "Ошибка авторизации Яндекс", 400, "YANDEX_OAUTH_FAILED", error);
}

export async function exchangeYandexCodeForToken(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<YandexTokenPayload> {
  const clientId = getYandexClientId();
  const clientSecret = getYandexClientSecret();
  if (!clientId) {
    throw new AppError("Не настроен YANDEX_OAUTH_CLIENT_ID.", 500, "YANDEX_CLIENT_ID_MISSING");
  }
  if (!clientSecret) {
    throw new AppError("Не настроен YANDEX_OAUTH_CLIENT_SECRET.", 500, "YANDEX_CLIENT_SECRET_MISSING");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("code_verifier", input.codeVerifier);
  body.set("redirect_uri", input.redirectUri);

  const res = await fetch(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as YandexTokenResponse | null;
  if (!json) {
    throw new AppError("Не удалось войти через Яндекс. Попробуйте ещё раз.", 502, "YANDEX_OAUTH_FAILED");
  }

  if ("error" in json) {
    throw resolveTokenError(json);
  }

  if (!res.ok) {
    throw new AppError("Не удалось войти через Яндекс. Попробуйте ещё раз.", 502, "YANDEX_OAUTH_FAILED", json);
  }

  if (!json.access_token) {
    throw new AppError("Не удалось войти через Яндекс. Попробуйте ещё раз.", 502, "YANDEX_OAUTH_FAILED", json);
  }

  return {
    accessToken: json.access_token,
    // Yandex returns a refresh_token; default to empty string so the row is
    // still valid (login-only flow never refreshes — parity with the schema).
    refreshToken: json.refresh_token ?? "",
    expiresIn: json.expires_in,
  };
}

function buildYandexAvatarUrl(info: YandexUserInfoResponse): string | null {
  if (info.is_avatar_empty || !info.default_avatar_id) return null;
  return `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`;
}

export async function fetchYandexProfile(accessToken: string): Promise<YandexProfile> {
  const res = await fetch(YANDEX_USER_INFO_URL, {
    method: "GET",
    headers: { Authorization: `OAuth ${accessToken}` },
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as YandexUserInfoResponse | null;
  if (!json) {
    throw new AppError("Не удалось получить профиль Яндекс ID. Попробуйте ещё раз.", 502, "YANDEX_PROFILE_FAILED");
  }

  if (json.error) {
    throw new AppError(json.error_description ?? "Не удалось получить профиль Яндекс ID. Попробуйте ещё раз.", 502, "YANDEX_PROFILE_FAILED", json);
  }

  if (!res.ok || !json.id) {
    throw new AppError("Не удалось получить профиль Яндекс ID. Попробуйте ещё раз.", 502, "YANDEX_PROFILE_FAILED", json);
  }

  const email = json.default_email?.trim() || json.emails?.[0]?.trim() || null;

  return {
    id: String(json.id),
    firstName: json.first_name?.trim() || null,
    lastName: json.last_name?.trim() || null,
    phone: json.default_phone?.number?.trim() || null,
    email,
    avatarUrl: buildYandexAvatarUrl(json),
  };
}

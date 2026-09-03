import { AppError } from "@/lib/api/errors";
import { getVkClientId, getVkClientSecret, getVkRedirectUri } from "@/lib/vk/config";

const VK_ID_AUTHORIZE_URL = "https://id.vk.ru/authorize";
const VK_ID_TOKEN_URL = "https://id.vk.ru/oauth2/auth";
/**
 * RES-09 — верхняя граница обмена с VK ID.
 *
 * Оба вызова стоят в callback'е авторизации: пользователь уже сходил к
 * провайдеру и вернулся, и его запрос висит, пока мы ходим за токеном и
 * профилем. Без границы медленный внешний партнёр держит слот обработки
 * бессрочно, а признака «таймаут» не появляется нигде — вход выглядит просто
 * зависшим. 10 с: обмен кода и чтение профиля — короткие запросы, порог
 * оставляет запас на сетевой хвост и заведомо короче терпения пользователя на
 * экране «входим».
 */
const OAUTH_REQUEST_TIMEOUT_MS = 10_000;
const VK_ID_USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";
// RKN-FIX-12: the logout endpoint constant went with `logoutVkSession` — see
// the note at the bottom of this file.

type VkIdTokenSuccess = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user_id?: number;
  state?: string;
  device_id?: string;
};

type VkIdTokenError = {
  error: string;
  error_description?: string;
  error_type?: string;
};

type VkIdTokenResponse = VkIdTokenSuccess | VkIdTokenError;

type VkIdUserInfoResponse =
  | {
      user?: {
        user_id?: number | string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        email?: string;
        avatar?: string;
      };
    }
  | {
      error?: string;
      error_description?: string;
    };

export type VkTokenPayload = {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  expiresIn?: number;
};

export type VkProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
};

function buildRedirectUri(base: string, mode: "auth" | "integrations"): string {
  const trimmed = base.trim();
  if (trimmed.includes("/api/auth/vk/callback")) {
    return mode === "auth"
      ? trimmed
      : trimmed.replace("/api/auth/vk/callback", "/api/integrations/vk/callback");
  }

  if (trimmed.includes("/api/integrations/vk/callback")) {
    return mode === "integrations"
      ? trimmed
      : trimmed.replace("/api/integrations/vk/callback", "/api/auth/vk/callback");
  }

  const normalized = trimmed.replace(/\/$/, "");
  return mode === "auth"
    ? `${normalized}/api/auth/vk/callback`
    : `${normalized}/api/integrations/vk/callback`;
}

export function requireVkRedirectUri(mode: "auth" | "integrations"): string {
  const redirectUri = getVkRedirectUri();
  if (!redirectUri) {
    throw new AppError("Вход через VK сейчас недоступен. Войдите другим способом.", 500, "VK_ID_REDIRECT_URI_MISSING");
  }
  return buildRedirectUri(redirectUri, mode);
}

export function buildVkAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const clientId = getVkClientId();
  if (!clientId) {
    throw new AppError("Вход через VK сейчас недоступен. Войдите другим способом.", 500, "VK_ID_CLIENT_ID_MISSING");
  }

  const url = new URL(VK_ID_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "email phone");
  return url.toString();
}

function resolveTokenError(error: VkIdTokenError): AppError {
  if (error.error === "invalid_grant") {
    return new AppError("Вход через VK не завершился. Начните заново.", 400, "VK_ID_INVALID_GRANT", error);
  }
  if (error.error === "expired_code") {
    return new AppError("Вход через VK не завершился. Начните заново.", 400, "VK_ID_EXPIRED_CODE", error);
  }
  return new AppError(error.error_description ?? "Ошибка авторизации VK ID", 400, "VK_ID_OAUTH_FAILED", error);
}

export async function exchangeVkCodeForToken(input: {
  code: string;
  codeVerifier: string;
  deviceId: string;
  redirectUri: string;
  state: string;
}): Promise<VkTokenPayload> {
  const clientId = getVkClientId();
  const clientSecret = getVkClientSecret();
  if (!clientId) {
    throw new AppError("Вход через VK сейчас недоступен. Войдите другим способом.", 500, "VK_ID_CLIENT_ID_MISSING");
  }
  if (!clientSecret) {
    throw new AppError("Вход через VK сейчас недоступен. Войдите другим способом.", 500, "VK_ID_CLIENT_SECRET_MISSING");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("code", input.code);
  body.set("code_verifier", input.codeVerifier);
  body.set("device_id", input.deviceId);
  body.set("redirect_uri", input.redirectUri);
  body.set("state", input.state);

  const res = await fetch(VK_ID_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as VkIdTokenResponse | null;
  if (!json) {
    throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 502, "VK_ID_OAUTH_FAILED");
  }

  if ("error" in json) {
    throw resolveTokenError(json);
  }

  if (!res.ok) {
    throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 502, "VK_ID_OAUTH_FAILED", json);
  }

  if (!json.access_token || !json.refresh_token) {
    throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 502, "VK_ID_OAUTH_FAILED", json);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    deviceId: json.device_id ?? input.deviceId,
    expiresIn: json.expires_in,
  };
}

export async function fetchVkProfile(accessToken: string): Promise<VkProfile> {
  const clientId = getVkClientId();
  if (!clientId) {
    throw new AppError("Не настроен VK_CLIENT_ID.", 500, "VK_ID_CLIENT_ID_MISSING");
  }

  const body = new URLSearchParams();
  body.set("access_token", accessToken);
  body.set("client_id", clientId);

  const res = await fetch(VK_ID_USER_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as VkIdUserInfoResponse | null;
  if (!json) {
    throw new AppError("Не удалось получить профиль VK. Попробуйте ещё раз.", 502, "VK_ID_PROFILE_FAILED");
  }

  if ("error" in json && json.error) {
    throw new AppError(json.error_description ?? "Не удалось получить профиль VK. Попробуйте ещё раз.", 502, "VK_ID_PROFILE_FAILED", json);
  }

  if (!res.ok) {
    throw new AppError("Не удалось получить профиль VK. Попробуйте ещё раз.", 502, "VK_ID_PROFILE_FAILED", json);
  }

  const user = "user" in json ? json.user : null;
  if (!user || !user.user_id) {
    throw new AppError("Не удалось получить профиль VK. Попробуйте ещё раз.", 502, "VK_ID_PROFILE_FAILED", json);
  }

  return {
    id: String(user.user_id),
    firstName: user.first_name?.trim() || null,
    lastName: user.last_name?.trim() || null,
    phone: user.phone?.trim() || null,
    email: user.email?.trim() || null,
    avatarUrl: user.avatar?.trim() || null,
  };
}

/**
 * RKN-FIX-12 — `refreshVkToken` and `logoutVkSession` were removed here.
 *
 * Both took a STORED provider token as input, and `VkLink` no longer keeps
 * one. `refreshVkToken` already had zero callers when the audit ran (dead
 * since it was written); `logoutVkSession` had exactly one, a best-effort call
 * on integration-disable whose only purpose was revoking the token we
 * ourselves persisted. Deleting them keeps the "no provider token at rest"
 * property enforceable: there is no longer a helper whose signature invites
 * someone to store one again.
 *
 * If a future feature genuinely needs to act on a user's behalf (e.g. a VK
 * flow that is NOT the planned Bot-API delivery, which runs on a community
 * token), re-introduce them together with encryption at rest — see the
 * RKN-FIX-12 report and the key-rotation backlog item.
 */

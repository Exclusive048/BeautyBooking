import crypto from "crypto";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import {
  classifyOAuthStartFailure,
  logOAuthStartFailure,
  oauthStartInternalRedirect,
  oauthStartProviderRedirect,
  type OAuthStartFailure,
  type OAuthStartNavigation,
} from "@/lib/auth/oauth-start-error";
import { buildVkAuthorizeUrl, requireVkRedirectUri } from "@/lib/vk/oauth";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/vk/pkce";
import { signVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_STATE_TTL_SECONDS, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { isProduction, isVkAuthEnabled } from "@/lib/env";

const VK_NOT_CONFIGURED_CODES = new Set([
  "VK_CLIENT_ID_MISSING",
  "VK_CLIENT_SECRET_MISSING",
  "VK_REDIRECT_URI_MISSING",
  "VK_ID_CLIENT_ID_MISSING",
  "VK_ID_CLIENT_SECRET_MISSING",
  "VK_ID_REDIRECT_URI_MISSING",
]);

/**
 * FIX-B14 — третья стартовая нога, найденная свипом (в задании названы не
 * были). Навигация сюда идёт из кабинета: `window.location.assign` в
 * `VkNotificationsSection`, — то есть все три её отказа были ровно такими же
 * JSON-тупиками, что и на `/login`-ногах.
 *
 * Назначение отличается, и это не стилистика: аудитория тут — УЖЕ вошедший
 * пользователь в настройках кабинета, и `/login` для него неверный адрес.
 * Поэтому исход тот же (`OAuthStartFailure`, общая классификация), а адрес
 * выводится из страницы, с которой он ушёл: `Referer`, прогнанный через
 * `sanitizeInternalPath` внутри `nextRedirect` (враждебное или чужое значение
 * схлопывается в дефолт `/cabinet/profile`). Флаг `?vk=<исход>` снимает
 * `VkNotificationsSection` — тот же компонент, что и увёл браузер, поэтому
 * сообщение появляется на ЛЮБОЙ странице, где эта кнопка отрисована, без
 * per-page плюмбинга.
 *
 * Исключение — отсутствие сессии: `/login` для неё и есть правильный адрес.
 */
function connectSurfacePath(req: Request): string {
  const referer = req.headers.get("referer");
  if (!referer) return "/cabinet/profile";
  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return "/cabinet/profile";
  }
}

function backToConnectSurface(req: Request, failure: OAuthStartFailure): OAuthStartNavigation {
  const path = connectSurfacePath(req);
  const separator = path.includes("?") ? "&" : "?";
  return oauthStartInternalRedirect(req, `${path}${separator}vk=${failure}`);
}

export async function GET(req: Request): Promise<OAuthStartNavigation> {
  // AUTH-KILLSWITCH-ENFORCE-01: the VK-connect (notifications) flow is the same
  // VK OAuth mechanism as login — gate it on the same `isVkAuthEnabled` so a
  // disabled VK provider can't be reached via the integrations entry point.
  if (!isVkAuthEnabled) {
    return backToConnectSurface(req, "provider_unavailable");
  }

  // FIX-B14: `requireAuth()` отдавал JSON 401 — на навигации это тупик, причём
  // самый достижимый из трёх (сессия истекла на открытой вкладке кабинета).
  // Здесь `/login` — правильный адрес, и `?next=` возвращает человека ровно
  // туда, откуда он нажал «подключить», а не в дефолтный кабинет.
  const user = await getSessionUser();
  if (!user) {
    return oauthStartInternalRedirect(
      req,
      `/login?next=${encodeURIComponent(connectSurfacePath(req))}`,
    );
  }

  try {
    const state = crypto.randomBytes(32).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const redirectUri = requireVkRedirectUri("integrations");
    const authUrl = buildVkAuthorizeUrl({ state, codeChallenge, redirectUri });

    const cookieStore = await cookies();
    cookieStore.set(VK_ID_STATE_COOKIE, signVkCookieValue(state), {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: VK_ID_STATE_TTL_SECONDS,
    });
    cookieStore.set(VK_ID_VERIFIER_COOKIE, signVkCookieValue(codeVerifier), {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: VK_ID_STATE_TTL_SECONDS,
    });

    return oauthStartProviderRedirect(authUrl);
  } catch (error) {
    // FIX-B14 + Y9: `appError.details` больше не уезжает в ответ, отказ —
    // навигация обратно на поверхность подключения.
    logOAuthStartFailure(req, error);
    return backToConnectSurface(req, classifyOAuthStartFailure(error, VK_NOT_CONFIGURED_CODES));
  }
}

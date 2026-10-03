import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import {
  oauthFlowCookieOptions,
  oauthFlowTtlSeconds,
  OAUTH_LOGIN_PROVIDERS,
  type OAuthLoginProvider,
} from "@/lib/auth/oauth-providers";

/**
 * MOBILE-AUTH-A2 — признак «этот OAuth-флоу начало приложение».
 *
 * Приложение входит через VK ID / Яндекс ID в системном браузере, а колбэк у
 * него ОБЩИЙ с вебом (`/api/auth/{vk,yandex}/callback`: redirect_uri,
 * зарегистрированный у провайдеров, менять нельзя). Колбэку нужно знать, что
 * флоу мобильный, — тогда он не ставит куки сессии, а уводит браузер в
 * приложение с одноразовым кодом. Этот признак и PKCE-челлендж приложения
 * несёт кука, устроенная как кука согласий (`legal/oauth-consent-cookie.ts`):
 *
 *     cookie = base64url(JSON { s: state, p: provider, c: codeChallenge, u: linkUserId })
 *              + "." + HMAC-SHA256(AUTH_JWT_SECRET, "mobile-oauth-flow:v1:" + payload)
 *
 * Колбэк доверяет ей только после подписи И привязки к state, который он сам
 * только что проверил. Поэтому:
 *  · подделать нельзя (подпись; префикс домена не даёт выдать за неё подписанное
 *    значение другой куки на том же секрете);
 *  · пережить другой флоу нельзя: Android Custom Tabs делят куки с Chrome, и
 *    брошенный мобильный флоу оставляет куку рядом с последующим ВЕБ-входом.
 *    Веб-старт перезаписывает state, привязка к нему ломается, и вход идёт
 *    по-вебовски — а не уводит веб-пользователя в приложение с кодом.
 *
 * `linkUserId` — пользователь, к которому привязывается аккаунт провайдера
 * (link-intent приложения). Сессию браузера мобильный флоу НЕ читает никогда:
 * Custom Tabs делят куки с Chrome, и браузер может нести веб-сессию совсем
 * другого человека.
 */

export const MOBILE_OAUTH_FLOW_COOKIE: Record<OAuthLoginProvider, string> = {
  vk: "vk_id_mobile",
  yandex: "yandex_oauth_mobile",
};

/** `base64url(sha256(codeVerifier))` без паддинга — ровно 43 символа (RFC 7636, S256). */
export const PKCE_S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** RFC 7636 §4.1: verifier — 43–128 символов из unreserved-алфавита. */
export const PKCE_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export type MobileOAuthFlow = {
  state: string;
  provider: OAuthLoginProvider;
  /** PKCE-челлендж приложения: одноразовый код выдаётся только под него. */
  codeChallenge: string;
  /** Привязка к уже вошедшему аккаунту приложения (link-intent); `null` — вход. */
  linkUserId: string | null;
};

const SIGNATURE_DOMAIN = "mobile-oauth-flow:v1:";

const payloadSchema = z.object({
  s: z.string().min(1).max(256),
  p: z.enum(OAUTH_LOGIN_PROVIDERS),
  c: z.string().regex(PKCE_S256_CHALLENGE_PATTERN),
  u: z.string().min(1).max(64).nullable(),
});

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: ReturnType<typeof oauthFlowCookieOptions>): unknown;
};

function requireSigningSecret(): string {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new AppError("Не удалось завершить вход. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", requireSigningSecret()).update(`${SIGNATURE_DOMAIN}${payload}`).digest("base64url");
}

function equalStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * PKCE S256 на стороне сервера: `base64url(sha256(verifier)) === challenge`.
 * Сравнение — за постоянное время; verifier не той формы не совпадает ни с чем.
 */
export function matchesPkceS256Challenge(codeVerifier: string, codeChallenge: string): boolean {
  if (!PKCE_CODE_VERIFIER_PATTERN.test(codeVerifier)) return false;
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return equalStrings(computed, codeChallenge);
}

export function signMobileOAuthFlowCookieValue(flow: MobileOAuthFlow): string {
  const payload = Buffer.from(
    JSON.stringify({ s: flow.state, p: flow.provider, c: flow.codeChallenge, u: flow.linkUserId }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * Подлинная кука ЭТОГО флоу этого провайдера либо `null` (нет, подделана,
 * битая, чужой state, чужой провайдер). `null` значит «флоу веб-овский».
 */
export function readMobileOAuthFlowCookieValue(
  cookieValue: string | null | undefined,
  provider: OAuthLoginProvider,
  expectedState: string | null | undefined,
): MobileOAuthFlow | null {
  if (!cookieValue || !expectedState) return null;
  const index = cookieValue.lastIndexOf(".");
  if (index <= 0) return null;

  const payload = cookieValue.slice(0, index);
  const signature = cookieValue.slice(index + 1);
  if (!signature || !equalStrings(signature, sign(payload))) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) return null;
  if (parsed.data.p !== provider) return null;
  if (!equalStrings(parsed.data.s, expectedState)) return null;

  return {
    state: parsed.data.s,
    provider: parsed.data.p,
    codeChallenge: parsed.data.c,
    linkUserId: parsed.data.u,
  };
}

/** Мобильный старт: кука живёт столько же, сколько state/verifier провайдера. */
export function setMobileOAuthFlowCookie(cookieStore: CookieStore, flow: MobileOAuthFlow): void {
  cookieStore.set(
    MOBILE_OAUTH_FLOW_COOKIE[flow.provider],
    signMobileOAuthFlowCookieValue(flow),
    oauthFlowCookieOptions(oauthFlowTtlSeconds(flow.provider)),
  );
}

export function readMobileOAuthFlowCookie(
  cookieStore: CookieStore,
  provider: OAuthLoginProvider,
  expectedState: string | null | undefined,
): MobileOAuthFlow | null {
  return readMobileOAuthFlowCookieValue(
    cookieStore.get(MOBILE_OAUTH_FLOW_COOKIE[provider])?.value,
    provider,
    expectedState,
  );
}

/**
 * Одноразовая, как state/verifier/согласия: гасится на каждом выходе колбэка.
 * Только если кука пришла — чисто веб-овский колбэк (куки нет вовсе) отвечает
 * байт-в-байт как до MOBILE-AUTH-A2, без лишнего `Set-Cookie`.
 */
export function clearMobileOAuthFlowCookie(cookieStore: CookieStore, provider: OAuthLoginProvider): void {
  const name = MOBILE_OAUTH_FLOW_COOKIE[provider];
  if (!cookieStore.get(name)) return;
  cookieStore.set(name, "", oauthFlowCookieOptions(0));
}

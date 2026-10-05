import { AppError, toAppError } from "@/lib/api/errors";
import { isRetryableOAuthCallbackFailure } from "@/lib/auth/oauth-callback-error";
import {
  linkOAuthIdentity,
  resolveOAuthLogin,
  type OAuthIdentity,
} from "@/lib/auth/oauth-login";
import type { MobileOAuthFlow } from "@/lib/auth/mobile-oauth-flow";
import { issueMobileOAuthCode } from "@/lib/auth/mobile-oauth-store";
import type { OAuthLoginProvider } from "@/lib/auth/oauth-providers";
import { extractClientIp } from "@/lib/http/ip";
import type { ConsentFlags } from "@/lib/legal/consent-flags";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import {
  mobileAuthCallbackRedirect,
  type MobileAuthCallbackError,
} from "@/lib/mobile/app-redirect";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { scrubRecord } from "@/lib/observability/scrub";
import { prisma } from "@/lib/prisma";

/**
 * MOBILE-AUTH-A2 — мобильная ветка общего OAuth-колбэка.
 *
 * Колбэк провайдера (`/api/auth/{vk,yandex}/callback`) узнаёт флоу приложения
 * по подписанной state-bound куке (`mobile-oauth-flow.ts`) и вместо кук сессии
 * и кабинета делает одно из двух:
 *
 *  · **вход** — тот же `resolveOAuthLogin`, что у веба, затем одноразовый код
 *    (60 с, под PKCE-челлендж приложения) и `masterryadom://auth/callback?code=…`;
 *  · **привязка** (`linkUserId` из link-intent) — тот же `linkOAuthIdentity`,
 *    затем `?linked=<provider>`: приложение уже вошло, кода не нужно.
 *
 * Сессию браузера эта ветка не читает НИКОГДА: Android Custom Tabs делят куки
 * с Chrome, и в браузере может жить веб-сессия совсем другого аккаунта. Цель
 * привязки — только владелец link-intent.
 *
 * Любой отказ — тоже переход в приложение (`?error=<исход>`), а не JSON: в
 * системном браузере конверт — тупик, из которого приложение не узнает, что
 * случилось. Идентификаторы и токены провайдера не попадают ни в адрес, ни в
 * лог (диагностика — со скрабом, как у `failOAuthCallback`).
 */

/** Колбэк провайдер-специфичен ровно до профиля: разбор ответа, state, обмен кода. */
export type ObtainOAuthIdentity = () => Promise<OAuthIdentity>;

/** state из ответа провайдера не совпал с кукой флоу, либо verifier потерян. */
export function mobileOAuthStateInvalid(provider: OAuthLoginProvider): AppError {
  return provider === "vk"
    ? new AppError("Вход через VK не завершился. Начните заново.", 400, "VK_STATE_INVALID")
    : new AppError("Вход через Яндекс не завершился. Начните заново.", 400, "YANDEX_STATE_INVALID");
}

function classifyMobileOAuthCallbackFailure(error: unknown): MobileAuthCallbackError {
  // FIX-B13: таймаут провайдера классифицируется по ИСХОДНОЙ ошибке — после
  // `toAppError` он уже неотличим от внутреннего сбоя.
  if (isRetryableOAuthCallbackFailure(error)) return "provider_timeout";
  const appError = error instanceof AppError ? error : toAppError(error);
  switch (appError.code) {
    case "VK_STATE_INVALID":
    case "YANDEX_STATE_INVALID":
      return "state_invalid";
    case "VK_ALREADY_LINKED":
      return "vk_already_linked";
    case "YANDEX_ALREADY_LINKED":
      return "yandex_already_linked";
    // FIX-B5: конфликт уникальности адреса — тот же исход, что веб-`email_taken`.
    case "ALREADY_EXISTS":
    case "EMAIL_ALREADY_USED":
      return "email_taken";
    default:
      return "callback_failed";
  }
}

function failMobileOAuthCallback(req: Request, provider: OAuthLoginProvider, error: unknown) {
  const appError = error instanceof AppError ? error : toAppError(error);
  const outcome = classifyMobileOAuthCallbackFailure(error);
  // SECURITY-EXPOSURE-AUDIT-01 · Y9: провайдерские библиотеки кладут в
  // `details` сырой ответ OAuth (токены, профиль) — в лог только со скрабом.
  logError("Mobile OAuth callback failed", {
    requestId: getRequestId(req),
    provider,
    outcome,
    code: appError.code,
    status: appError.status,
    details:
      appError.details && typeof appError.details === "object"
        ? scrubRecord(appError.details as Record<string, unknown>)
        : undefined,
  });
  void recordSurfaceEvent({
    surface: "auth",
    outcome: "failure",
    operation: `mobile-oauth-${provider}-callback`,
    code: outcome,
  });
  return mobileAuthCallbackRedirect({ error: outcome });
}

/**
 * Хвост мобильного колбэка. Куки флоу вызывающий уже прочитал и погасил —
 * здесь только решение и ответ.
 */
export async function completeMobileOAuthCallback(
  req: Request,
  flow: MobileOAuthFlow,
  input: {
    /** Согласия этого флоу (подписанная кука, привязанная к state), `null` — не захвачены. */
    consentFlags: ConsentFlags | null;
    obtainIdentity: ObtainOAuthIdentity;
  },
): Promise<Response> {
  const { provider } = flow;

  // Отказ на странице провайдера (`?error=access_denied&state=…`) — не сбой:
  // приложение молча вернёт человека на экран входа.
  const providerError = new URL(req.url).searchParams.get("error");
  if (providerError) {
    const outcome: MobileAuthCallbackError = providerError === "access_denied" ? "access_denied" : "callback_failed";
    logInfo("Mobile OAuth callback: provider returned an error", { provider, outcome });
    return mobileAuthCallbackRedirect({ error: outcome });
  }

  try {
    const identity = await input.obtainIdentity();
    const consent = {
      flags: input.consentFlags,
      ipAddress: extractClientIp(req),
      userAgent: req.headers.get("user-agent"),
    };

    if (flow.linkUserId) {
      // Владелец intent мог удалить аккаунт за 10 минут флоу — привязывать
      // провайдера к удалённому профилю нельзя.
      const owner = await prisma.userProfile.findFirst({
        where: { id: flow.linkUserId, isDeleted: false },
        select: { id: true, roles: true },
      });
      if (!owner) {
        throw new AppError("Не удалось привязать аккаунт. Попробуйте ещё раз.", 401, "UNAUTHORIZED");
      }
      await linkOAuthIdentity({ identity, user: owner, consent });
      logInfo("Mobile OAuth link completed", { provider, userProfileId: owner.id });
      return mobileAuthCallbackRedirect({ linked: provider });
    }

    const resolution = await resolveOAuthLogin({ identity, consent });
    if (!resolution.ok) {
      return mobileAuthCallbackRedirect({ error: "consent_required" });
    }

    const code = await issueMobileOAuthCode({
      userId: resolution.user.id,
      codeChallenge: flow.codeChallenge,
      provider,
    });
    logInfo("Mobile OAuth login: one-time code issued", { provider, userProfileId: resolution.user.id });
    return mobileAuthCallbackRedirect({ code });
  } catch (error) {
    return failMobileOAuthCallback(req, provider, error);
  }
}

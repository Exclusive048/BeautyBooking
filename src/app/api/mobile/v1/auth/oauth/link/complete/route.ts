import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { withRequestContext } from "@/lib/api/with-request-context";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
import { matchesPkceS256Challenge } from "@/lib/auth/mobile-oauth-flow";
import { takeMobileOAuthLinkCode } from "@/lib/auth/mobile-oauth-store";
import { MOBILE_NO_STORE_INIT } from "@/lib/auth/mobile-session";
import { linkOAuthIdentity } from "@/lib/auth/oauth-login";
import { getSessionUser } from "@/lib/auth/session";
import { extractClientIp } from "@/lib/http/ip";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

/**
 * MOBILE-OAUTH-LINK-COMPLETE (C-01) — приложение завершает привязку VK ID /
 * Яндекс ID к СВОЕМУ аккаунту.
 *
 * Флоу привязки: `…/oauth/{provider}/link-intent` (Bearer) → `…/start?intent=`
 * в системном браузере → провайдер → общий колбэк, который кончается
 * `masterryadom://auth/callback?code=…&link=<provider>`. Связку колбэк НЕ
 * пишет: intent предъявительский, и браузер по нему мог пройти кто угодно,
 * кого владелец intent отправил по ссылке. Пишет её только этот шаг, и только
 * когда сошлись оба доказательства:
 *
 *  · **Bearer владельца intent** (`user.id === linkUserId` записи) — у жертвы
 *    чужой ссылки его нет, и её приложение, поймавшее код, привязку не
 *    завершит;
 *  · **PKCE-verifier** к челленджу старта — код оседает на устройстве того,
 *    кто открыл браузер, и у владельца ссылки, отправившего туда другого
 *    человека, кода нет вовсе; verifier сверх того не даёт завершить привязку
 *    тому, кто перехватил переход на схему `masterryadom://` на устройстве
 *    самого владельца.
 *
 * Порядок проверок:
 *  1. Сессия — ДО кода. 401 — сигнал приложению обновить access-токен и
 *     повторить запрос; сжигать на нём код значило бы заставить человека
 *     проходить VK/Яндекс заново из-за протухшего за поход в браузер токена.
 *     Про код этот ответ ничего не говорит. Заблокированный владелец intent
 *     сюда не доходит: чтение сессии требует `blockedAt: null`
 *     (USER-BLOCKING-01, `loadActiveSessionUser`).
 *  2. `GETDEL` кода — до сверки: предъявленный код сгорает при ЛЮБОМ исходе,
 *     подбор verifier'а или аккаунта даёт ровно одну попытку.
 *  3. Владелец и verifier. Любой отказ по коду — один ответ
 *     `400 OAUTH_CODE_INVALID`, как у `/oauth/exchange`: «нет такого»,
 *     «протух», «использован», «не тот аккаунт» и «не тот verifier» снаружи
 *     неразличимы.
 *
 * Дальше — тот же `linkOAuthIdentity`, что у веб-привязки: связка, согласия
 * (флаги из записи; IP и User-Agent — этого запроса, то есть устройства
 * владельца), подписки, номер из профиля провайдера (PHONE-OAUTH-PROOF-01) с
 * переносом гостевых записей. Отказ `*_ALREADY_LINKED` — 409 с готовым
 * текстом.
 *
 * Лимит — тир `mobileAuth` прокси (POST под `/api/mobile/v1/auth/`), путь
 * fail-closed при обрыве Redis; без Redis код не проверить — 503.
 */

const bodySchema = z.object({
  code: z.string().trim().min(1).max(256),
  codeVerifier: z.string().trim().min(1).max(256),
});

function withNoStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function linkCodeInvalid(req: Request, reason: string): Response {
  // Ни кода, ни verifier'а в логе: только причина — для разбора, не для ответа.
  logInfo("Mobile OAuth link completion refused", { requestId: getRequestId(req), reason });
  void recordSurfaceEvent({
    surface: "auth",
    outcome: "failure",
    operation: "mobile-oauth-link-complete",
    code: "OAUTH_CODE_INVALID",
  });
  return withNoStore(fail("Не удалось привязать аккаунт. Начните привязку заново.", 400, "OAUTH_CODE_INVALID"));
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const user = await getSessionUser();
    if (!user) {
      return withNoStore(fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED"));
    }

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return withNoStore(fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR"));
    }

    try {
      const record = await takeMobileOAuthLinkCode(parsed.data.code);
      if (!record) {
        return linkCodeInvalid(req, "unknown_or_used");
      }
      if (record.linkUserId !== user.id) {
        return linkCodeInvalid(req, "foreign_account");
      }
      if (!matchesPkceS256Challenge(parsed.data.codeVerifier, record.codeChallenge)) {
        return linkCodeInvalid(req, "pkce_mismatch");
      }

      const provider = record.identity.provider;
      await linkOAuthIdentity({
        identity: record.identity,
        user,
        consent: {
          flags: record.consentFlags,
          ipAddress: extractClientIp(req),
          userAgent: req.headers.get("user-agent"),
        },
      });

      logInfo("Mobile OAuth link completed", { provider, userProfileId: user.id });
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "success",
        operation: `mobile-oauth-${provider}-link`,
      });
      return ok({ linked: provider }, MOBILE_NO_STORE_INIT);
    } catch (error) {
      // FIX-C6 · Y9: у вида auth-поверхности нет `details` — сырой ответ
      // провайдера уехать в тело не может. Причина — в лог со стеком.
      const view = toAuthSurfaceError(error);
      if (view.status === 503) {
        // Redis недоступен — код не проверить (fail-closed, `mobile-oauth-store.ts`).
        return withNoStore(fail("Сервис временно недоступен. Попробуйте позже.", 503, "SERVICE_UNAVAILABLE"));
      }
      if (view.status < 500) {
        // `VK_ALREADY_LINKED` / `YANDEX_ALREADY_LINKED` — готовый текст для человека.
        return withNoStore(fail(view.message, view.status, view.code));
      }
      logError("POST /api/mobile/v1/auth/oauth/link/complete failed", {
        requestId: getRequestId(req),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return withNoStore(fail("Не удалось привязать аккаунт. Попробуйте ещё раз.", 500, "INTERNAL_ERROR"));
    }
  });
}

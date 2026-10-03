import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import {
  completeOtpLogin,
  type OtpLoginChannel,
  type OtpLoginProfile,
  type OtpLoginResult,
} from "@/lib/auth/otp-login";
import { issueSession, type SessionTokens } from "@/lib/auth/session";
import { readMobileSessionIssueMeta } from "@/lib/auth/session-client-meta";
import { getMeIdentityFromDb } from "@/lib/users/me";

/**
 * MOBILE-AUTH-A — транспорт сессии нативного приложения.
 *
 * Веб получает сессию куками; приложение кук не держит, поэтому та же пара
 * токенов (`issueSession` / `rotateSession`) уходит в ТЕЛЕ ответа, а дальше
 * клиент шлёт access-токен в `Authorization: Bearer`. Тело с токенами никогда
 * не кэшируется (`no-store`): это то же самое, что `Set-Cookie`, только видимое.
 */

export const MOBILE_NO_STORE_INIT: ResponseInit = { headers: { "Cache-Control": "no-store" } };

/** Тело `{ refreshToken }` для `/refresh` и `/logout`. */
export const mobileRefreshTokenBodySchema = z.object({
  refreshToken: z.string().trim().min(1).max(4096),
});

export type MobileSessionTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export function serializeSessionTokens(tokens: SessionTokens): MobileSessionTokens {
  return {
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
  };
}

/**
 * Хвост мобильного OTP-входа: профиль в форме `GET /api/me` (`data.user`),
 * новая семья сессий с метаданными устройства из заголовков, общий хвост
 * входа (`completeOtpLogin`) и ответ `{ tokens, user }` без кук.
 *
 * Профиль читается ДО выдачи сессии: если строки нет (удалена в гонке), отказ
 * не оставляет за собой живую семью.
 */
export async function respondWithMobileOtpLogin(
  req: Request,
  result: Extract<OtpLoginResult, { ok: true }>,
  channel: OtpLoginChannel,
) {
  const { profile } = result;
  return respondWithMobileSession(req, profile, () => completeOtpLogin(profile, channel, result.startedAt));
}

/**
 * MOBILE-AUTH-A2 — общий хвост любого мобильного входа (OTP, обмен OAuth-кода):
 * профиль в форме `GET /api/me`, новая семья сессий с метой устройства и ответ
 * `{ tokens, user }` без кук. `afterIssue` — хвост конкретного способа входа
 * (у OTP — `completeOtpLogin`), выполняется только после выдачи сессии.
 */
export async function respondWithMobileSession(
  req: Request,
  profile: OtpLoginProfile,
  afterIssue?: () => void,
) {
  const user = await getMeIdentityFromDb(profile.id);
  if (!user) {
    return fail("Не удалось войти. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }

  const tokens = await issueSession(
    { sub: profile.id, phone: profile.phone, roles: profile.roles },
    readMobileSessionIssueMeta(req.headers),
  );
  afterIssue?.();

  return ok({ tokens: serializeSessionTokens(tokens), user }, MOBILE_NO_STORE_INIT);
}

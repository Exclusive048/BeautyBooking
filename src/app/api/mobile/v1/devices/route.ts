import { z } from "zod";
import type { MobilePushProvider } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { MOBILE_NO_STORE_INIT } from "@/lib/auth/mobile-session";
import { getSessionContext } from "@/lib/auth/session";
import { readSessionDeviceMeta } from "@/lib/auth/session-client-meta";
import { logError } from "@/lib/logging/logger";
import { registerPushDevice, unregisterPushDevice } from "@/lib/notifications/native-push/devices";

/**
 * MOBILE-B2 — push-токен установки нативного приложения.
 *
 * `POST` — зарегистрировать или обновить токен этой установки
 * (`X-Installation-Id`): строка одна на установку, повторный вход другим
 * аккаунтом переносит её, тот же токен у другой установки удаляется там.
 * Токен привязывается к семье текущего входа: выход и завершение сессии
 * удаляют его сами (`revokeRefreshSessionByToken`, `session-families.ts`).
 * `DELETE` — отвязать токен этой установки (выключили уведомления).
 *
 * Регистрация работает и при выключенной отправке (`features.push = false`):
 * выключатель решает, уходит ли push, а не копятся ли токены.
 * Токен в лог не попадает.
 */

const UNAUTHORIZED_MESSAGE = "Требуется вход в аккаунт.";
const CLIENT_HEADERS_MESSAGE =
  "Не удалось включить уведомления: приложение не передало данные устройства. Обновите приложение и попробуйте ещё раз.";
const REGISTER_FAILED_MESSAGE = "Не удалось включить уведомления. Попробуйте ещё раз.";
const UNREGISTER_FAILED_MESSAGE = "Не удалось отключить уведомления. Попробуйте ещё раз.";

const PROVIDERS = { fcm: "FCM", apns: "APNS", rustore: "RUSTORE" } as const satisfies Record<
  string,
  MobilePushProvider
>;

/** Видимые ASCII-символы: токены FCM / RuStore — base64url с `:`, APNs — hex. */
const TOKEN_PATTERN = /^[\x21-\x7E]+$/;
const APNS_TOKEN_PATTERN = /^[0-9a-fA-F]{32,200}$/;

const registerBodySchema = z
  .object({
    provider: z.enum(["fcm", "apns", "rustore"], { message: "Неизвестный сервис push-уведомлений." }),
    token: z
      .string({ message: "Нужен push-токен устройства." })
      .trim()
      .min(1, "Нужен push-токен устройства.")
      .max(1024, "Слишком длинный push-токен.")
      .regex(TOKEN_PATTERN, "Неверный формат push-токена."),
    apnsEnvironment: z.enum(["sandbox", "production"], { message: "Неверное окружение APNs." }).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.provider === "apns" && !APNS_TOKEN_PATTERN.test(body.token)) {
      ctx.addIssue({ code: "custom", path: ["token"], message: "Неверный формат push-токена APNs." });
    }
    if (body.provider !== "apns" && body.apnsEnvironment !== undefined) {
      ctx.addIssue({ code: "custom", path: ["apnsEnvironment"], message: "Окружение APNs — только для provider=apns." });
    }
  });

/** Сервис доставки должен существовать на платформе установки. */
function isProviderAllowedOnPlatform(provider: keyof typeof PROVIDERS, platform: string): boolean {
  if (provider === "apns") return platform === "ios";
  if (provider === "rustore") return platform === "android";
  return platform === "ios" || platform === "android";
}

function readClientDevice(req: Request) {
  const meta = readSessionDeviceMeta(req.headers);
  const missing: string[] = [];
  if (!meta.installationId) missing.push("X-Installation-Id");
  if (!meta.platform) missing.push("X-Client-Platform");
  return { meta, missing };
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const session = await getSessionContext();
    // Без семьи (`fid`, токены до SEC-13) токену не к чему привязаться — выход
    // его не отвязал бы. Приложение выпускается уже с семьями.
    if (!session || !session.familyId) {
      return fail(UNAUTHORIZED_MESSAGE, 401, "UNAUTHORIZED");
    }

    const { meta, missing } = readClientDevice(req);
    if (missing.length > 0 || !meta.installationId || !meta.platform) {
      return fail(CLIENT_HEADERS_MESSAGE, 400, "VALIDATION_ERROR", { missingHeaders: missing });
    }

    const parsed = registerBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? REGISTER_FAILED_MESSAGE, 400, "VALIDATION_ERROR", {
        field: issue?.path.join(".") || null,
      });
    }
    const body = parsed.data;
    if (!isProviderAllowedOnPlatform(body.provider, meta.platform)) {
      return fail("Этот сервис push-уведомлений недоступен на платформе устройства.", 400, "VALIDATION_ERROR", {
        field: "provider",
      });
    }

    try {
      await registerPushDevice({
        userId: session.user.id,
        sessionFamilyId: session.familyId,
        installationId: meta.installationId,
        provider: PROVIDERS[body.provider],
        token: body.token,
        apnsEnvironment:
          body.provider === "apns" ? (body.apnsEnvironment === "sandbox" ? "SANDBOX" : "PRODUCTION") : null,
        platform: meta.platform,
        appVersion: meta.appVersion,
      });
    } catch (error) {
      logError("POST /api/mobile/v1/devices failed", {
        userId: session.user.id,
        provider: body.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return fail(REGISTER_FAILED_MESSAGE, 500, "INTERNAL_ERROR");
    }

    return ok({ registered: true }, MOBILE_NO_STORE_INIT);
  });
}

export async function DELETE(req: Request) {
  return withRequestContext(req, async () => {
    const session = await getSessionContext();
    if (!session) {
      return fail(UNAUTHORIZED_MESSAGE, 401, "UNAUTHORIZED");
    }

    const { meta } = readClientDevice(req);
    if (!meta.installationId) {
      return fail(CLIENT_HEADERS_MESSAGE, 400, "VALIDATION_ERROR", { missingHeaders: ["X-Installation-Id"] });
    }

    try {
      await unregisterPushDevice(session.user.id, meta.installationId);
    } catch (error) {
      logError("DELETE /api/mobile/v1/devices failed", {
        userId: session.user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return fail(UNREGISTER_FAILED_MESSAGE, 500, "INTERNAL_ERROR");
    }

    return ok({}, MOBILE_NO_STORE_INIT);
  });
}

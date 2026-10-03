import "server-only";
import {
  env,
  isApnsConfigured,
  isFcmConfigured,
  isMobilePushEnabled,
  isMobilePushSwitchOn,
  isRustorePushConfigured,
} from "@/lib/env";

/**
 * MOBILE-B2 — настройки native push из окружения (схема и проверки — `env.ts`).
 *
 * Отправка = юридический выключатель `MOBILE_PUSH_SENDING_ENABLED` (по
 * умолчанию выключен до вердикта юриста по RKN-AUDIT-01) И настроенный
 * провайдер. Регистрация устройств от выключателя не зависит: токены копятся,
 * чтобы после включения push дошёл сразу всем, а не только тем, кто открыл
 * приложение заново.
 */

export type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };
export type ApnsConfig = { teamId: string; keyId: string; privateKey: string; bundleId: string };
export type RustorePushConfig = { projectId: string; serviceToken: string };

/**
 * PEM из переменной окружения: в `.env` ключ обычно лежит одной строкой с
 * буквальными `\n` (так его отдаёт JSON сервисного аккаунта Google) и иногда в
 * кавычках. Приводим к настоящему PEM.
 */
export function normalizePemKey(raw: string): string {
  let value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return `${value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim()}\n`;
}

const trimmed = (value: string | undefined): string => (value ?? "").trim();

export function readFcmConfig(): FcmConfig | null {
  if (!isFcmConfigured) return null;
  return {
    projectId: trimmed(env.FCM_PROJECT_ID),
    clientEmail: trimmed(env.FCM_CLIENT_EMAIL),
    privateKey: normalizePemKey(env.FCM_PRIVATE_KEY ?? ""),
  };
}

export function readApnsConfig(): ApnsConfig | null {
  if (!isApnsConfigured) return null;
  return {
    teamId: trimmed(env.APNS_TEAM_ID),
    keyId: trimmed(env.APNS_KEY_ID),
    privateKey: normalizePemKey(env.APNS_PRIVATE_KEY ?? ""),
    bundleId: trimmed(env.APNS_BUNDLE_ID),
  };
}

export function readRustorePushConfig(): RustorePushConfig | null {
  if (!isRustorePushConfigured) return null;
  return {
    projectId: trimmed(env.RUSTORE_PUSH_PROJECT_ID),
    serviceToken: trimmed(env.RUSTORE_PUSH_SERVICE_TOKEN),
  };
}

export type NativePushAvailability = {
  /** Отправка разрешена и есть хотя бы один провайдер — `features.push` конфига. */
  sending: boolean;
  /** Провайдеры, через которые push сейчас реально уходит (выключатель включён). */
  providers: { fcm: boolean; apns: boolean; rustore: boolean };
};

export function getNativePushAvailability(): NativePushAvailability {
  return {
    sending: isMobilePushEnabled,
    providers: {
      fcm: isMobilePushSwitchOn && isFcmConfigured,
      apns: isMobilePushSwitchOn && isApnsConfigured,
      rustore: isMobilePushSwitchOn && isRustorePushConfigured,
    },
  };
}

export function isNativePushSendingEnabled(): boolean {
  return isMobilePushEnabled;
}

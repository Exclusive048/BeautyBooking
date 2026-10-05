import type { SessionClientType } from "@prisma/client";

/**
 * MOBILE-AUTH-A — метаданные устройства для строки `RefreshSession`.
 *
 * Источник — заголовки, которые мобильное приложение шлёт в каждом запросе
 * (контракт `MasterRyadomMobile/docs/API-CONTRACT.md`): `X-Client-Platform`,
 * `X-App-Version`, `X-Device-Name`, `X-Installation-Id`, `User-Agent`. Всё это
 * присылает клиент, то есть верить нельзя ничему, кроме формы: значение либо
 * проходит проверку формата/длины, либо становится `null`. Свободный текст
 * (имя устройства, User-Agent) не отвергается, а чистится от управляющих
 * символов и обрезается — его покажут человеку в списке сессий (A3).
 *
 * Длины совпадают с `@db.VarChar(n)` колонок (prisma/schema/auth.prisma):
 * обрезка идёт по кодовым точкам, а VARCHAR в Postgres считает именно их,
 * поэтому значение после обрезки в колонку помещается всегда.
 */

export const SESSION_META_MAX_LENGTH = {
  platform: 16,
  appVersion: 32,
  deviceName: 100,
  installationId: 64,
  userAgent: 512,
} as const;

export type SessionDeviceMeta = {
  platform: string | null;
  appVersion: string | null;
  deviceName: string | null;
  installationId: string | null;
  userAgent: string | null;
};

export const SESSION_DEVICE_META_KEYS = [
  "platform",
  "appVersion",
  "deviceName",
  "installationId",
  "userAgent",
] as const satisfies ReadonlyArray<keyof SessionDeviceMeta>;

export type SessionIssueMeta = { clientType: SessionClientType } & Partial<SessionDeviceMeta>;

/** Платформы, для которых сервер держит min/latest-версию (`/api/mobile/v1/config`). */
const KNOWN_PLATFORMS = new Set(["ios", "android"]);
/** `1.0.0`, `1.0.0+12`, `1.2.0-beta.3` — semver-подобная строка без пробелов. */
const APP_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;
/** UUID установки; допускаем и иные непрозрачные id того же алфавита. */
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
// Управляющие символы C0 + DEL: в списке сессий и логах им делать нечего.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g;

function truncateCodePoints(value: string, max: number): string {
  const codePoints = Array.from(value);
  return codePoints.length > max ? codePoints.slice(0, max).join("") : value;
}

/**
 * Значение заголовка — ByteString (Latin-1): «iPhone Анны» сырым не доедет
 * (undici отвергает символы > 255, а принятые байты UTF-8 Node прочтёт как
 * Latin-1 — получится mojibake). Поэтому не-ASCII имя клиент шлёт
 * percent-encoded UTF-8 (`encodeURIComponent`); битая последовательность
 * остаётся как есть.
 */
function decodePercentEncoded(raw: string | null): string | null {
  if (!raw || !raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function cleanFreeText(raw: string | null, max: number): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return truncateCodePoints(cleaned, max).trim() || null;
}

function cleanToken(raw: string | null, pattern: RegExp, max: number): string | null {
  const value = raw?.trim();
  if (!value || value.length > max || !pattern.test(value)) return null;
  return value;
}

export function normalizeClientPlatform(raw: string | null): string | null {
  const value = raw?.trim().toLowerCase();
  return value && KNOWN_PLATFORMS.has(value) ? value : null;
}

/** Метаданные устройства из заголовков запроса мобильного клиента. */
export function readSessionDeviceMeta(headers: Headers): SessionDeviceMeta {
  return {
    platform: normalizeClientPlatform(headers.get("x-client-platform")),
    appVersion: cleanToken(headers.get("x-app-version"), APP_VERSION_PATTERN, SESSION_META_MAX_LENGTH.appVersion),
    deviceName: cleanFreeText(decodePercentEncoded(headers.get("x-device-name")), SESSION_META_MAX_LENGTH.deviceName),
    installationId: cleanToken(
      headers.get("x-installation-id"),
      INSTALLATION_ID_PATTERN,
      SESSION_META_MAX_LENGTH.installationId,
    ),
    userAgent: cleanFreeText(headers.get("user-agent"), SESSION_META_MAX_LENGTH.userAgent),
  };
}

/** Мета новой мобильной сессии (выдача по OTP / обмен OAuth-кода). */
export function readMobileSessionIssueMeta(headers: Headers): SessionIssueMeta {
  return { clientType: "MOBILE", ...readSessionDeviceMeta(headers) };
}

/**
 * MOBILE-AUTH-A3 — мета веб-сессии: только User-Agent. По нему список сессий
 * (`GET /api/me/sessions`) показывает «Chrome, Windows»; сырой UA наружу не
 * уходит (`session-families.ts`). Заголовки `X-*` у веба не читаются вовсе.
 * Нет UA — нет меты: строка пишется прежней формы.
 */
export function readWebSessionIssueMeta(headers: Headers): SessionIssueMeta | undefined {
  const userAgent = cleanFreeText(headers.get("user-agent"), SESSION_META_MAX_LENGTH.userAgent);
  return userAgent ? { clientType: "WEB", userAgent } : undefined;
}

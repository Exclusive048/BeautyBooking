import { AppError } from "@/lib/api/errors";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";

/**
 * STORAGE-UNAVAILABLE-01 — хранилище фото не отвечает или отказало целиком.
 *
 * Повод — алерт 2026-10-10: Object Storage приостановил аккаунт
 * (`TenantSuspended: Tenant is in suspended state`). Каждое фото на странице —
 * отдельный запрос `/api/media/file/…`, и каждый уходил в Telegram отдельной
 * «ERROR … failed» со стеком SDK: одна причина у провайдера превращалась в поток
 * одинаковых алертов, а из стека не было видно, что делать.
 *
 * Здесь такой сбой получает ОДНО имя и одну форму:
 *   · `StorageUnavailableError` — 503 `SERVICE_UNAVAILABLE` с понятной строкой
 *     вместо «500 Не получилось»; роуты чтения медиа по нему не шлют алерт на
 *     каждый запрос и ставят `Retry-After`;
 *   · один алерт с паузой на причину (`storage:unavailable:<имя>`), в тексте —
 *     что проверить.
 *
 * ⚠️ Что сюда НЕ входит, и почему это важно:
 *   · 404 — «объекта нет», его разбирает `isMissingObjectError` (FIX-C12) раньше;
 *   · 403 `AccessDenied`, `InvalidAccessKeyId`, `SignatureDoesNotMatch` и прочие
 *     отказы прав/подписи — это НАША конфигурация (ключи, политика бакета), а не
 *     недоступность провайдера. Они обязаны остаться громкими 500 с алертом на
 *     каждый случай, и на удалении — бросать (FIX-C12: проглоченный отказ прав
 *     означал бы «ПДн удалена» при живом объекте).
 * `TenantSuspended` тоже приходит с 403, поэтому решает ИМЯ, а не статус.
 */

/** Аккаунт/тенант хранилища выключен — до действия в консоли провайдера. */
const ACCOUNT_DISABLED_NAMES = new Set(["TenantSuspended", "AccountProblem", "AllAccessDisabled"]);

/** Провайдер временно не справляется или не отвечает. */
const TRANSIENT_NAMES = new Set([
  "ServiceUnavailable",
  "SlowDown",
  "InternalError",
  "RequestTimeout",
  "TimeoutError",
]);

/** Сеть до хранилища: соединение не установилось или оборвалось. */
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

const STORAGE_ALERT_COOLDOWN_MS = 30 * 60_000;
const STORAGE_RETRY_AFTER_SECONDS = 60;

export type StorageOperation = "getObject" | "putObject" | "deleteObject";

type StorageErrorShape = {
  name?: unknown;
  code?: unknown;
  $metadata?: { httpStatusCode?: unknown };
};

function errorName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { name } = error as StorageErrorShape;
  return typeof name === "string" ? name : null;
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as StorageErrorShape).$metadata?.httpStatusCode;
  return typeof status === "number" ? status : null;
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { code } = error as StorageErrorShape;
  return typeof code === "string" ? code : null;
}

/**
 * Сбой — недоступность хранилища, а не дефект запроса и не наша конфигурация.
 * Порядок проверок важен: имя аккаунтного отказа побеждает статус 403.
 */
export function isStorageOutage(error: unknown): boolean {
  const name = errorName(error);
  if (name && (ACCOUNT_DISABLED_NAMES.has(name) || TRANSIENT_NAMES.has(name))) return true;
  const code = errorCode(error);
  if (code && NETWORK_CODES.has(code)) return true;
  const status = errorStatus(error);
  return status !== null && status >= 500;
}

export class StorageUnavailableError extends AppError {
  readonly operation: StorageOperation;
  readonly providerErrorName: string | null;

  constructor(operation: StorageOperation, cause: unknown) {
    super("Хранилище фото временно недоступно. Попробуйте позже.", 503, "SERVICE_UNAVAILABLE", {
      reason: "STORAGE_UNAVAILABLE",
    });
    this.name = "StorageUnavailableError";
    this.operation = operation;
    this.providerErrorName = errorName(cause);
    this.cause = cause;
  }
}

export function isStorageUnavailableError(error: unknown): error is StorageUnavailableError {
  return error instanceof StorageUnavailableError;
}

function alertText(operation: StorageOperation, cause: unknown): string {
  const name = errorName(cause) ?? errorCode(cause) ?? "unknown";
  const status = errorStatus(cause);
  const where = `${operation}: ${name}${status !== null ? ` (HTTP ${status})` : ""}`;
  if (ACCOUNT_DISABLED_NAMES.has(name)) {
    // Ни ретраи, ни деплой это не вылечат — нужен человек в консоли провайдера.
    return `🚨 Хранилище фото отключено провайдером — ${where}. Фото не открываются и не загружаются. Проверьте баланс и статус аккаунта Object Storage.`;
  }
  return `⚠️ Хранилище фото не отвечает — ${where}. Фото временно не открываются и не загружаются.`;
}

/**
 * Единственная точка входа для адаптера хранилища: недоступность превращает в
 * `StorageUnavailableError` (+ один алерт на причину с паузой), всё остальное
 * возвращает как есть — вызывающий бросает его, как бросал раньше.
 */
export function toStorageFailure(operation: StorageOperation, error: unknown): unknown {
  if (!isStorageOutage(error)) return error;
  const name = errorName(error) ?? errorCode(error) ?? "unknown";
  void sendTelegramAlert(
    alertText(operation, error),
    `storage:unavailable:${name}`,
    STORAGE_ALERT_COOLDOWN_MS,
  ).catch(() => undefined);
  return new StorageUnavailableError(operation, error);
}

/** Заголовки ответа на недоступность: клиенту и кэшам — повторить позже. */
export function storageUnavailableHeaders(): Record<string, string> {
  return { "Retry-After": String(STORAGE_RETRY_AFTER_SECONDS), "Cache-Control": "no-store" };
}

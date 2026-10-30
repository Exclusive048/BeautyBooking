import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";
import { scrubString } from "@/lib/observability/scrub";

export type AlertLevel = "critical" | "error" | "warning";
export type AlertContext = Record<string, unknown>;

/**
 * RES-23. Верхняя граница исходящего запроса к Telegram Bot API.
 *
 * Вызов идёт через `void` из `logError`, то есть запрос пользователя он не
 * держит — но и не отпускает сокет: без границы каждая запись об ошибке
 * оставляет висящее соединение undici, а «много ошибок» — это ровно тот режим,
 * ради которого канал и существует. 5 с, а не 10, как у платёжных/OAuth-вызовов:
 * доставка алерта best-effort и никого не блокирует, поэтому здесь важнее
 * быстро освободить сокет, чем дождаться ответа.
 */
const ALERT_REQUEST_TIMEOUT_MS = 5_000;

const LEVEL_LABELS: Record<AlertLevel, { emoji: string; label: string }> = {
  critical: { emoji: "🚨", label: "CRITICAL" },
  error: { emoji: "⚠️", label: "ERROR" },
  warning: { emoji: "💛", label: "WARNING" },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

/**
 * ALERT-CONTEXT-ALLOWLIST (D-02) — в Telegram уходит только то, что названо
 * здесь; остальная мета остаётся в structured log.
 *
 * Сюда приходят ВСЕ алерты: `logError` (через паузу `alert-cooldown.ts`),
 * `sendTelegramAlert`, `api-alerts`, прямые `alertCritical` / `alertWarning`.
 * А `logError` отдавал свою мету целиком — `userProfileId` (OTP-вход), `ip`
 * (партнёрская заявка), полный адрес страницы из клиентского отчёта об ошибке
 * (в том числе ссылку «Управлять записью» с действующим токеном), почтовые
 * адреса из диагностики SMTP. Ops-чат и сам Telegram (иностранный сервис)
 * получали ПДн и рабочие предъявительские токены. Закрытый пункт
 * TELEGRAM-ALERT-PII-REVIEW утверждал, что id из чата устранён, — неверно:
 * пересылка меты была и до него.
 *
 * Поэтому — список РАЗРЕШЁННОГО, а не запрещённого: новое поле с id человека,
 * адресом или телефоном не уедет в чат молча, а запрещающий список отставал бы
 * от каждого нового вызова `logError` (их сотни). Набор выведен из фактических
 * вызовов: корреляция с логом (`requestId` — по нему находится полная запись),
 * что и где сломалось (коды, статусы, этапы, имена), числа (сколько, как часто,
 * порог) и текст ошибки. Id сущностей (записи, оплаты, кабинета) сюда не
 * входят намеренно: в чате достаточно `requestId`, а связать запись с
 * человеком — дело structured log, не мессенджера.
 */
const ALERT_CONTEXT_KEYS: ReadonlySet<string> = new Set([
  // Корреляция: найти полную запись в structured log.
  "requestId",
  "lastRequestId",
  "jobId",
  "jobType",
  "digest",
  "alertKey",
  // Что и где сломалось — имена, коды, классы, а не данные человека.
  "route",
  "lastRoute",
  "lastMessage",
  "code",
  "errorCode",
  "status",
  "statusCode",
  "responseCode",
  "alertStatus",
  "errorKind",
  "errorName",
  "phase",
  "op",
  "outcome",
  "kind",
  "type",
  "event",
  "reason",
  "mode",
  "source",
  "scope",
  "surface",
  "actorType",
  "channel",
  "provider",
  "role",
  "model",
  "namespace",
  "command",
  "level",
  "block",
  "sources",
  "missingEnv",
  "smtpHost",
  "smtpPort",
  "hasPass",
  // Числа: сколько, как часто, какой порог.
  "suppressedRepeats",
  "countInWindow",
  "windowMinutes",
  "threshold",
  "count",
  "deadCount",
  "pendingCount",
  "lastPingAgoSec",
  "attempts",
  "maxAttempts",
  "rowCount",
  "failed",
  "cleared",
  "length",
  "width",
  "periodMonths",
  "expectedKopeks",
  "apiKopeks",
  "recordedKopeks",
  // Текст ошибки — нужен для разбора, но несёт что угодно (тексты Prisma и
  // SMTP цитируют адреса и номера): только после `scrubString`, как и всё ниже.
  "error",
  "errorMessage",
  "lastError",
  "alertError",
  "firstError",
  "err",
  "message",
  "stack",
]);

/** Предел значения: стек и тексты Prisma бывают длиннее всего сообщения Telegram (4096). */
const MAX_ALERT_VALUE_LENGTH = 600;
/**
 * Строк в значении. Многострочное значение — это почти всегда стек (он едет и
 * под `stack`, и под `error`): заголовок и первые кадры показывают место
 * падения, хвост фреймворка — нет.
 */
const MAX_ALERT_VALUE_LINES = 6;

function stringifyAlertValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // `JSON.stringify(new Error(…))` — это «{}»: текст ошибки терялся бы целиком.
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Циклы и BigInt: бросок здесь — необработанное отклонение у `void sendAlert`.
    return String(value);
  }
}

function formatAlertValue(value: unknown): string {
  const text = scrubString(stringifyAlertValue(value)).split("\n").slice(0, MAX_ALERT_VALUE_LINES).join("\n");
  return text.length > MAX_ALERT_VALUE_LENGTH ? `${text.slice(0, MAX_ALERT_VALUE_LENGTH)}…` : text;
}

function formatContext(context?: AlertContext): string[] {
  if (!context) return [];
  const lines: string[] = [];
  let omitted = 0;
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    if (!ALERT_CONTEXT_KEYS.has(key)) {
      omitted += 1;
      continue;
    }
    lines.push(`${escapeHtml(key)}: ${escapeHtml(formatAlertValue(value))}`);
  }
  // Число, а не имена: имена полей из разобранного внешнего JSON (`...details`)
  // выбирает не код.
  if (omitted > 0) lines.push(`(ещё полей в логе: ${omitted})`);
  return lines;
}

export async function sendAlert(
  level: AlertLevel,
  message: string,
  context?: AlertContext
): Promise<void> {
  if (env.NODE_ENV !== "production") return;

  const token = env.MONITORING_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.MONITORING_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    logError(message, {
      level,
      ...(context ?? {}),
      __skipAlert: true,
    });
    return;
  }

  const { emoji, label } = LEVEL_LABELS[level];
  const contextLines = formatContext(context);
  const parts = [
    `${emoji} ${label}`,
    "",
    // Заголовок — тоже через скраббер: тексты `logError` бывают с подстановками.
    `[МастерРядом] ${emoji} ${escapeHtml(scrubString(message))}`,
  ];
  if (contextLines.length > 0) {
    parts.push("", ...contextLines);
  }
  parts.push("", `🕐 ${formatUtcTimestamp(new Date())}`);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: parts.join("\n"),
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(ALERT_REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      logError(message, {
        level,
        ...(context ?? {}),
        alertStatus: res.status,
        __skipAlert: true,
      });
    }
  } catch (error) {
    logError(message, {
      level,
      ...(context ?? {}),
      alertError: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
}


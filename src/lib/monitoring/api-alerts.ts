import { trackError } from "@/lib/monitoring/alerts";
import { sendAlertWithCooldown } from "@/lib/monitoring/alert-cooldown";

/**
 * Ops-события: каждое — ОДНО сообщение в Telegram с паузой по ключу.
 *
 * До OPS-ALERT-COOLDOWN-ON-LOGERROR каждая функция слала два: короткое
 * предупреждение с паузой (`sendTelegramAlert`) и «подробное» без паузы
 * (`alertCritical` / `alertWarning`). Второе и было штормом: неявка воркера —
 * на каждый опрос `/api/health/status`, каждая dead-задача, каждая попытка
 * перебора OTP, каждый 5xx сверх порога. Теперь подробности едут в том же
 * сообщении, уровень — прежний у подробного алерта.
 */

const API_5XX_ALERT_KEY = "api:5xx";
const API_5XX_THRESHOLD = 5;
const API_5XX_COOLDOWN_MS = 5 * 60_000;

const DEAD_JOBS_ALERT_KEY = "queue:dead-jobs";
const DEAD_JOBS_COOLDOWN_MS = 10 * 60_000;

const WEBHOOK_FAILURE_ALERT_KEY = "webhook:failure";
const WEBHOOK_FAILURE_COOLDOWN_MS = 15 * 60_000;

const OTP_RATE_LIMIT_ALERT_KEY = "otp:rate-limit";
const OTP_RATE_LIMIT_COOLDOWN_MS = 60_000;

const WORKER_DOWN_ALERT_KEY = "worker:down";
const WORKER_DOWN_COOLDOWN_MS = 5 * 60_000;

const QUEUE_BACKLOG_ALERT_KEY = "queue:backlog";
const QUEUE_BACKLOG_COOLDOWN_MS = 15 * 60_000;

export function track5xxError(route: string, requestId: string, errorMessage: string): void {
  const count = trackError(API_5XX_ALERT_KEY);
  if (count < API_5XX_THRESHOLD) return;
  void sendAlertWithCooldown(
    "critical",
    `Высокая частота 5xx ошибок API (${count} за минуту)`,
    {
      threshold: API_5XX_THRESHOLD,
      lastRoute: route,
      lastRequestId: requestId,
      lastError: errorMessage,
    },
    { key: API_5XX_ALERT_KEY, cooldownMs: API_5XX_COOLDOWN_MS }
  );
}

export function alertDeadJobs(deadCount: number): void {
  if (deadCount <= 0) return;
  void sendAlertWithCooldown(
    "warning",
    `Dead jobs в очереди: ${deadCount}`,
    { deadCount },
    { key: DEAD_JOBS_ALERT_KEY, cooldownMs: DEAD_JOBS_COOLDOWN_MS }
  );
}

export function alertWebhookFailure(
  provider: string,
  code: string,
  details?: Record<string, unknown>
): void {
  void sendAlertWithCooldown(
    "warning",
    `Webhook failure: ${provider} — ${code}`,
    { code, ...details },
    { key: `${WEBHOOK_FAILURE_ALERT_KEY}:${provider}:${code}`, cooldownMs: WEBHOOK_FAILURE_COOLDOWN_MS }
  );
}

export function alertOtpRateLimitTriggered(
  ip: string | null,
  phone?: string
): void {
  void sendAlertWithCooldown(
    "warning",
    "OTP rate limit triggered — возможный bruteforce",
    {
      ip: ip ?? "unknown",
      phone: phone ? `${phone.slice(0, 4)}****` : "unknown",
    },
    { key: OTP_RATE_LIMIT_ALERT_KEY, cooldownMs: OTP_RATE_LIMIT_COOLDOWN_MS }
  );
}

export function alertWorkerDown(lastPingAgoSec: number | null): void {
  void sendAlertWithCooldown(
    "critical",
    `Worker не отвечает (последний ping: ${lastPingAgoSec !== null ? `${lastPingAgoSec}s назад` : "never"})`,
    { lastPingAgoSec },
    { key: WORKER_DOWN_ALERT_KEY, cooldownMs: WORKER_DOWN_COOLDOWN_MS }
  );
}

export function alertQueueBacklog(pendingCount: number): void {
  void sendAlertWithCooldown(
    "warning",
    `Очередь задач переполнена: ${pendingCount} задач в ожидании`,
    { pendingCount },
    { key: QUEUE_BACKLOG_ALERT_KEY, cooldownMs: QUEUE_BACKLOG_COOLDOWN_MS }
  );
}

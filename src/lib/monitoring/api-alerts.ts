import { alertCritical, alertWarning } from "@/lib/monitoring";
import { trackError, sendTelegramAlert } from "@/lib/monitoring/alerts";

const API_5XX_ALERT_KEY = "api:5xx";
const API_5XX_THRESHOLD = 5;

const DEAD_JOBS_ALERT_KEY = "queue:dead-jobs";
const WEBHOOK_FAILURE_ALERT_KEY = "webhook:failure";
const OTP_RATE_LIMIT_ALERT_KEY = "otp:rate-limit";
const WORKER_DOWN_ALERT_KEY = "worker:down";

export function track5xxError(route: string, requestId: string, errorMessage: string): void {
  const count = trackError(API_5XX_ALERT_KEY);
  if (count >= API_5XX_THRESHOLD) {
    void alertCritical("Высокая частота 5xx ошибок API", {
      countInWindow: count,
      threshold: API_5XX_THRESHOLD,
      lastRoute: route,
      lastRequestId: requestId,
      lastError: errorMessage,
    });
  }
}

export function alertDeadJobs(deadCount: number): void {
  if (deadCount <= 0) return;
  void sendTelegramAlert(
    `Dead jobs в очереди: ${deadCount}`,
    DEAD_JOBS_ALERT_KEY
  );
  void alertWarning("Dead jobs обнаружены в очереди задач", {
    deadCount,
  });
}

export function alertWebhookFailure(
  provider: string,
  code: string,
  details?: Record<string, unknown>
): void {
  void sendTelegramAlert(
    `Webhook failure: ${provider} — ${code}`,
    `${WEBHOOK_FAILURE_ALERT_KEY}:${provider}:${code}`
  );
  void alertWarning(`Webhook failure: ${provider}`, {
    code,
    ...details,
  });
}

export function alertOtpRateLimitTriggered(
  ip: string | null,
  phone?: string
): void {
  void sendTelegramAlert(
    `OTP rate limit triggered — возможный bruteforce`,
    OTP_RATE_LIMIT_ALERT_KEY
  );
  void alertWarning("OTP rate limit triggered", {
    ip: ip ?? "unknown",
    phone: phone ? `${phone.slice(0, 4)}****` : "unknown",
  });
}

export function alertWorkerDown(lastPingAgoSec: number | null): void {
  void sendTelegramAlert(
    `Worker не отвечает (последний ping: ${lastPingAgoSec !== null ? `${lastPingAgoSec}s назад` : "never"})`,
    WORKER_DOWN_ALERT_KEY
  );
  void alertCritical("Worker не отвечает", {
    lastPingAgoSec,
  });
}

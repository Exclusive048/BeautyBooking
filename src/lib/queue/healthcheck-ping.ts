import { env } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";

/**
 * WORKER-PING-EXTRACT-FOR-BEHAVIOUR-GUARD (FIX-B13) — пинг живости воркера,
 * вынесенный из `src/worker.ts` ради ПРОВЕРЯЕМОСТИ.
 *
 * Что здесь важно понимать про место вызова: пинг стоит в главном цикле, **до**
 * `dequeue()`, то есть это не фоновая телеметрия, а часть витка. Отсюда весь
 * дизайн: у запроса есть верхняя граница (RES-25), отказ проглатывается, и цикл
 * обязан дойти до `dequeue()` в любом случае. Отказ этого механизма — худший из
 * возможных по наблюдаемости: очередь встаёт, а healthcheck при этом зелёный,
 * ошибок нет, алертов нет. Именно канал «воркер жив» и глушил бы сам воркер.
 *
 * Почему модуль, а не функция в точке входа: `src/worker.ts` вызывает
 * `startWorker()` НА ИМПОРТЕ (Redis, Postgres, таймеры, `process.exit`),
 * поэтому в vitest его не поднять, и сторож дедлайна мог быть только
 * source-level — то есть проверять текст файла, а не поведение. `fetchImpl`
 * инжектируется ровно как в `createSmscProvider`, где инъекция и позволила
 * проверить срабатывание дедлайна на зависшем хосте.
 */

export const HEALTHCHECK_INTERVAL_MS = 30_000;

/**
 * RES-25: граница заведомо меньше интервала между пингами — даже намертво
 * зависший `app` стоит воркеру одного витка, а не работы. Соотношение
 * проверяется тестом, а не соглашением.
 */
export const HEALTHCHECK_REQUEST_TIMEOUT_MS = 5_000;

export type HealthcheckPinger = {
  /** Пингует, если с прошлого раза прошёл интервал. Никогда не бросает. */
  maybePing: () => Promise<void>;
  /** Пингует безусловно. Никогда не бросает. */
  ping: () => Promise<void>;
};

export function resolveHealthcheckUrl(): string {
  const appUrl = (
    env.NEXT_PUBLIC_APP_URL ??
    env.APP_PUBLIC_URL ??
    "http://127.0.0.1:3000"
  ).trim();
  return `${appUrl.replace(/\/+$/, "")}/api/health/worker`;
}

export function resolveWorkerSecret(): string | null {
  const secret = env.WORKER_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

export function createHealthcheckPinger(config?: {
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  timeoutMs?: number;
  resolveUrl?: () => string;
  resolveSecret?: () => string | null;
}): HealthcheckPinger {
  const fetchImpl = config?.fetchImpl ?? fetch;
  const intervalMs = config?.intervalMs ?? HEALTHCHECK_INTERVAL_MS;
  const timeoutMs = config?.timeoutMs ?? HEALTHCHECK_REQUEST_TIMEOUT_MS;
  const resolveUrl = config?.resolveUrl ?? resolveHealthcheckUrl;
  const resolveSecret = config?.resolveSecret ?? resolveWorkerSecret;

  // Латч «сообщили один раз»: без секрета пинг невозможен, но повторять это
  // каждые 30 с значило бы залить лог. Состояние экземпляра, а не модуля —
  // иначе тесты влияли бы друг на друга через общий модульный флаг.
  let secretMissingLogged = false;
  let lastPingAt = 0;

  async function ping(): Promise<void> {
    const workerSecret = resolveSecret();
    if (!workerSecret) {
      if (!secretMissingLogged) {
        logInfo("Worker healthcheck ping skipped: WORKER_SECRET is not configured");
        secretMissingLogged = true;
      }
      return;
    }

    try {
      await fetchImpl(resolveUrl(), {
        method: "POST",
        headers: {
          "x-worker-secret": workerSecret,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Проглатывается намеренно: провал пинга не должен ни ронять воркер, ни
      // звенеть в Telegram — иначе недоступный `app` даст шторм алертов с двух
      // сторон разом.
      logError("Worker healthcheck ping failed", {
        error: error instanceof Error ? error.message : String(error),
        __skipAlert: true,
      });
    }
  }

  return {
    ping,
    async maybePing(): Promise<void> {
      const now = Date.now();
      if (now - lastPingAt < intervalMs) return;
      lastPingAt = now;
      await ping();
    },
  };
}

/**
 * WORKER-LIVENESS-ALERT — постоянный наблюдатель воркера очереди.
 *
 * Все алерты очереди (переполнение, dead-letter) шлёт САМ воркер, поэтому
 * зависший или упавший воркер не алертил никто: напоминания, вебхуки ЮКассы,
 * `media.purge`, пересчёт «свободно сегодня» молча вставали. Живость была
 * видна только на панели админа и в ручной пробе `/api/health/worker`, а
 * `alertWorkerDown` срабатывал лишь из `/api/health/status` — то есть когда
 * кто-то этот роут опрашивал (DEPLOY-BACKLOG I8: постоянно — никто).
 *
 * Поэтому проверяет ПРОЦЕСС ПРИЛОЖЕНИЯ, а не воркер: воркер о собственной
 * смерти сообщить не может. Раз в минуту `web` и `api` читают
 * `worker:last-ping` через `readWorkerLiveness` (тот же ключ и тот же порог
 * 2 мин, что у роутов здоровья и панели — `queue/worker-liveness.ts`) и при
 * протухшей или пропавшей отметке зовут `alertWorkerDown`. Дубль между двумя
 * контейнерами и `/api/health/status` снимает общая пауза по ключу
 * `worker:down` в Redis (`alert-cooldown.ts`): одно сообщение на окно, а не
 * по сообщению от каждого процесса.
 *
 * Чего НЕ делаем намеренно:
 *   · Redis недоступен — не алертим. Отметку читать неоткуда, и «воркер мёртв»
 *     было бы выводом из молчания хранилища, а не из молчания воркера; про
 *     Redis сообщают свои каналы (лимитер, кэш, `/api/health/ready`).
 *   · Первые 2 мин жизни процесса — не алертим. После деплоя приложение и
 *     воркер перезапускаются вместе, а на свежей базе Redis отметки ещё нет:
 *     воркеру дан тот же запас, что и порог живости.
 *
 * Ставится из `src/proxy.ts` рядом с флашером метрик API — по той же причине,
 * по которой там стоит флашер (instrumentation-entry не резолвит `redis`).
 * Таймер свой и `unref`: флашер тикает раз в 10 с, и чтение отметки на каждом
 * его тике было бы в шесть раз чаще нужного.
 */

import { alertWorkerDown } from "@/lib/monitoring/api-alerts";
import {
  WORKER_ALIVE_THRESHOLD_MS,
  readWorkerLiveness,
  type WorkerLiveness,
} from "@/lib/queue/worker-liveness";

export const WORKER_LIVENESS_CHECK_INTERVAL_MS = 60_000;

/** Сколько процесс приложения ждёт после старта наблюдения, прежде чем судить
 * о воркере, — столько же, сколько порог живости. */
export const WORKER_LIVENESS_WARMUP_MS = WORKER_ALIVE_THRESHOLD_MS;

export type WorkerLivenessAlertDecision =
  | { kind: "skip"; reason: "redis-unavailable" | "alive" | "warming-up" }
  | { kind: "alert"; lastPingAgoSec: number | null };

/**
 * Решение по одному замеру. Чистая функция — вся логика «когда кричать» здесь.
 *
 * `liveness === null` — Redis не ответил (`readWorkerLiveness` не бросает).
 * `unknown` (отметки нет) алертится так же, как `stale`: ключ живёт 5 мин,
 * и у воркера, умершего давно, отметки нет вовсе — без этого алерт замолкал
 * бы через пять минут после смерти, а не начинался.
 */
export function decideWorkerLivenessAlert(input: {
  liveness: WorkerLiveness | null;
  watchedForMs: number;
}): WorkerLivenessAlertDecision {
  const { liveness, watchedForMs } = input;
  if (liveness === null) return { kind: "skip", reason: "redis-unavailable" };
  if (liveness.state === "alive") return { kind: "skip", reason: "alive" };
  if (watchedForMs < WORKER_LIVENESS_WARMUP_MS) return { kind: "skip", reason: "warming-up" };
  return {
    kind: "alert",
    lastPingAgoSec: liveness.lastPingAgoMs === null ? null : Math.floor(liveness.lastPingAgoMs / 1000),
  };
}

let watchTimer: ReturnType<typeof setInterval> | null = null;
let watchStartedAtMs = 0;
let checkInFlight = false;

/**
 * Один замер: прочитать отметку, решить, при необходимости отправить алерт.
 * Никогда не бросает — сбой наблюдателя не должен ронять процесс приложения.
 */
export async function checkWorkerLivenessOnce(
  nowMs = Date.now(),
  startedAtMs = watchStartedAtMs,
): Promise<WorkerLivenessAlertDecision | null> {
  // Чтение ограничено границей команды Redis (2.5 с), поэтому наложение
  // минутных тиков невозможно на практике; флаг — страховка от двойного алерта.
  if (checkInFlight) return null;
  checkInFlight = true;
  try {
    const liveness = await readWorkerLiveness(nowMs);
    const decision = decideWorkerLivenessAlert({ liveness, watchedForMs: nowMs - startedAtMs });
    if (decision.kind === "alert") alertWorkerDown(decision.lastPingAgoSec);
    return decision;
  } catch {
    return null;
  } finally {
    checkInFlight = false;
  }
}

/** Запустить наблюдение (идемпотентно). `false` — уже запущено. */
export function startWorkerLivenessWatch(intervalMs = WORKER_LIVENESS_CHECK_INTERVAL_MS): boolean {
  if (watchTimer) return false;
  watchStartedAtMs = Date.now();
  watchTimer = setInterval(() => {
    void checkWorkerLivenessOnce();
  }, intervalMs);
  watchTimer.unref?.();
  return true;
}

export function stopWorkerLivenessWatch(): void {
  if (!watchTimer) return;
  clearInterval(watchTimer);
  watchTimer = null;
}

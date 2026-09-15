/**
 * ADMIN-HEALTH-01 — живость воркера очереди как ОДНО место истины.
 *
 * Воркер каждые 30 с шлёт `POST /api/health/worker` (`queue/healthcheck-ping.ts`),
 * и роут пишет `worker:last-ping` = epoch-ms с TTL 5 мин. До этого ключ и
 * порог жили литералами в двух роутах (`health/worker`, `health/status`), а
 * панель админа про воркер не знала вовсе — «0 ждёт» с мёртвым воркером
 * выглядело здоровым. Теперь константы и классификация здесь, а роуты и
 * панель их импортируют.
 */

import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

export const WORKER_LAST_PING_KEY = "worker:last-ping";
export const WORKER_ALIVE_THRESHOLD_MS = 120_000;

export type WorkerLiveness = {
  /** `alive` — отметка свежее порога; `stale` — есть, но старая; `unknown` —
   * отметки нет (воркер ни разу не отметился либо ключ истёк). */
  state: "alive" | "stale" | "unknown";
  lastPingAgoMs: number | null;
};

export function classifyWorkerPing(lastPingRaw: string | null | undefined, nowMs: number): WorkerLiveness {
  if (!lastPingRaw) return { state: "unknown", lastPingAgoMs: null };
  const parsed = Number.parseInt(lastPingRaw, 10);
  if (!Number.isFinite(parsed)) return { state: "unknown", lastPingAgoMs: null };
  const ageMs = Math.max(0, nowMs - parsed);
  return {
    state: ageMs < WORKER_ALIVE_THRESHOLD_MS ? "alive" : "stale",
    lastPingAgoMs: ageMs,
  };
}

/** `null` — Redis недоступен, судить о воркере нечем. Никогда не бросает. */
export async function readWorkerLiveness(nowMs = Date.now()): Promise<WorkerLiveness | null> {
  try {
    const client = await getRedisConnection();
    if (!client) return null;
    const raw = await withRedisCommandTimeout("worker-liveness:get", client.get(WORKER_LAST_PING_KEY));
    return classifyWorkerPing(typeof raw === "string" ? raw : null, nowMs);
  } catch {
    return null;
  }
}

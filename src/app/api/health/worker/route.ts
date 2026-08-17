import { getQueueStats } from "@/lib/queue/queue";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import { timingSafeStringEqual } from "@/lib/auth/constant-time";
import { env, isProduction } from "@/lib/env";

export const runtime = "nodejs";

const WORKER_LAST_PING_KEY = "worker:last-ping";
const WORKER_PING_TTL_SECONDS = 300;
const WORKER_ALIVE_THRESHOLD_MS = 120_000;

function resolveWorkerSecret(): string | null {
  const secret = env.WORKER_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

function formatAgeSeconds(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return "never";
  return `${Math.max(0, Math.round(ageMs / 1000))}s`;
}

function verifyWorkerSecret(request: Request): Response | null {
  const expectedSecret = resolveWorkerSecret();

  if (!expectedSecret) {
    if (isProduction) {
      logError("WORKER_SECRET not configured in production — rejecting worker health request", {
        __skipAlert: true,
      });
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }
    return null;
  }

  const providedSecret = request.headers.get("x-worker-secret")?.trim() ?? "";
  if (!providedSecret || !timingSafeStringEqual(providedSecret, expectedSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  const authError = verifyWorkerSecret(request);
  if (authError) return authError;

  try {
    const redis = await getRedisConnection();
    if (!redis) {
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }

    // FIX-C4: запись heartbeat ограничена сверху. Пост-дедлайн — тот же 503,
    // что и при недоступном клиенте (catch ниже): воркер не смог отметиться,
    // и это ровно то, о чём эндпоинт существует сообщать.
    await withRedisCommandTimeout(
      "health:worker:ping-write",
      redis.set(WORKER_LAST_PING_KEY, String(Date.now()), { EX: WORKER_PING_TTL_SECONDS }),
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const authError = verifyWorkerSecret(request);
  if (authError) return authError;

  try {
    const redis = await getRedisConnection();
    const stats = await getQueueStats();

    if (!redis) {
      return Response.json(
        {
          alive: false,
          lastPingAgo: formatAgeSeconds(Number.POSITIVE_INFINITY),
          queue: stats,
        },
        { status: 503 }
      );
    }

    // FIX-C4: чтение отметки ограничено сверху. Пост-дедлайн — ветка catch
    // ниже: `alive: false` + 503 + текущая статистика очереди, то есть тот же
    // ответ, что и при мёртвом воркере. Это и есть правда: отметку прочитать
    // не удалось, значит подтвердить жизнь нечем.
    const lastPingRaw = await withRedisCommandTimeout(
      "health:worker:ping-read",
      redis.get(WORKER_LAST_PING_KEY),
    );
    const lastPingAt = lastPingRaw ? Number.parseInt(lastPingRaw, 10) : Number.NaN;
    const ageMs = Number.isFinite(lastPingAt) ? Date.now() - lastPingAt : Number.POSITIVE_INFINITY;
    const alive = Number.isFinite(ageMs) && ageMs < WORKER_ALIVE_THRESHOLD_MS;

    return Response.json(
      {
        alive,
        lastPingAgo: formatAgeSeconds(ageMs),
        queue: stats,
      },
      { status: alive ? 200 : 503 }
    );
  } catch {
    const stats = await getQueueStats();
    return Response.json(
      {
        alive: false,
        lastPingAgo: formatAgeSeconds(Number.POSITIVE_INFINITY),
        queue: stats,
      },
      { status: 503 }
    );
  }
}

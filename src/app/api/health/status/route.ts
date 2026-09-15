import { ok, fail } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { timingSafeStringEqual } from "@/lib/auth/constant-time";
import { logError } from "@/lib/logging/logger";
import { getAllSurfaceStatuses } from "@/lib/monitoring/status";
import { alertDeadJobs, alertWorkerDown } from "@/lib/monitoring/api-alerts";
import { getNotificationsNotifierRuntimeStatus, getNotificationsNotifier } from "@/lib/notifications/notifier";
import { prisma } from "@/lib/prisma";
import { getQueueStats } from "@/lib/queue/queue";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { env, isProduction } from "@/lib/env";
import { WORKER_ALIVE_THRESHOLD_MS, WORKER_LAST_PING_KEY } from "@/lib/queue/worker-liveness";

export const runtime = "nodejs";

const QUEUE_PENDING_OVERLOAD_THRESHOLD = 1000;
const QUEUE_DEAD_THRESHOLD = 10;
const QUEUE_PROCESSING_THRESHOLD = 50;

function resolveWorkerSecret(): string | null {
  const secret = env.WORKER_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

function parsePingAgeSeconds(lastPingAt: number | null): number | null {
  if (lastPingAt === null || !Number.isFinite(lastPingAt)) return null;
  const ageSeconds = Math.floor((Date.now() - lastPingAt) / 1000);
  return ageSeconds >= 0 ? ageSeconds : 0;
}

async function isAuthorized(request: Request): Promise<boolean> {
  const expectedSecret = resolveWorkerSecret();
  const providedSecret = request.headers.get("x-worker-secret")?.trim();
  // SEC-25: сравнение секрета — constant-time, как в соседних роутах
  // (`health/worker`, cron-эндпоинты). Голое `===` выходит на первом же
  // несовпавшем байте, то есть время ответа коррелирует с длиной верного
  // префикса. Общий хелпер вдобавок хеширует обе стороны, поэтому не утекает и
  // длина (SEC-20).
  if (expectedSecret && providedSecret && timingSafeStringEqual(providedSecret, expectedSecret)) {
    return true;
  }

  const admin = await requireAdminAuth();
  return admin.ok;
}

export async function GET(request: Request) {
  return withRequestContext(request, async () => {
    if (!(await isAuthorized(request))) {
      return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
    }

    const [surfaceStatuses, queueStats] = await Promise.all([
      getAllSurfaceStatuses(),
      getQueueStats(),
    ]);

    let dbReady = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch (error) {
      logError("Health status DB check failed", {
        error: error instanceof Error ? error.message : String(error),
        __skipAlert: true,
      });
    }

    const redis = await getRedisConnection();
    let redisReady = false;
    let workerLastPingAtMs: number | null = null;
    let workerAlive = false;

    if (redis) {
      try {
        // FIX-C4 — 🔴 обе команды были БЕЗ границы, а это главный
        // диагностический эндпоинт runbook'а: дежурный, которого
        // `redis-down.md` сюда посылает, получал зависание вместо картины
        // отказа. FIX-C2 счёл роут ограниченным, потому что `getQueueStats` и
        // `monitoring/status` обёрнуты, — но СОБСТВЕННЫЕ команды роута
        // обёрнуты не были. Тот отчёт честно пометил это выводом по чтению, а
        // не замером; замер показал обратное.
        //
        // Пост-дедлайн — существующий `catch` ниже: `redisReady` остаётся
        // false, воркер — `alive: false`. То есть ровно то состояние, ради
        // сообщения о котором эндпоинт и существует.
        await withRedisCommandTimeout("health:status:ping", redis.ping());
        redisReady = true;
        const lastPingRaw = await withRedisCommandTimeout(
          "health:status:worker-ping",
          redis.get(WORKER_LAST_PING_KEY),
        );
        const parsed = lastPingRaw ? Number.parseInt(lastPingRaw, 10) : Number.NaN;
        workerLastPingAtMs = Number.isFinite(parsed) ? parsed : null;
        if (workerLastPingAtMs !== null) {
          workerAlive = Date.now() - workerLastPingAtMs < WORKER_ALIVE_THRESHOLD_MS;
        }
      } catch (error) {
        logError("Health status Redis check failed", {
          error: error instanceof Error ? error.message : String(error),
          __skipAlert: true,
        });
      }
    }

    let notifierReady = false;
    try {
      await getNotificationsNotifier();
      notifierReady = true;
    } catch {
      notifierReady = false;
    }
    const notifierRuntime = getNotificationsNotifierRuntimeStatus();

    const queueStatsAvailable =
      queueStats.pending >= 0 && queueStats.processing >= 0 && queueStats.dead >= 0;
    const queueOverloaded =
      queueStats.pending > QUEUE_PENDING_OVERLOAD_THRESHOLD ||
      queueStats.processing > QUEUE_PROCESSING_THRESHOLD ||
      queueStats.dead > QUEUE_DEAD_THRESHOLD;

    if (queueStats.dead > 0) {
      alertDeadJobs(queueStats.dead);
    }

    if (!workerAlive && redisReady) {
      alertWorkerDown(parsePingAgeSeconds(workerLastPingAtMs));
    }

    const readiness = {
      db: dbReady,
      redis: redisReady,
      worker: workerAlive,
      queueStats: queueStatsAvailable,
      notifier: notifierReady,
    };

    const ready = isProduction
      ? readiness.db && readiness.redis && readiness.worker && readiness.queueStats && readiness.notifier
      : readiness.db && readiness.queueStats;

    const httpStatus = ready ? 200 : 503;

    return ok(
      {
        generatedAt: new Date().toISOString(),
        environment: env.NODE_ENV,
        readiness: {
          ...readiness,
          ready,
        },
        queueWorker: {
          workerAlive,
          workerLastPingAgoSec: parsePingAgeSeconds(workerLastPingAtMs),
          stats: queueStats,
          overloaded: queueOverloaded,
          thresholds: {
            pending: QUEUE_PENDING_OVERLOAD_THRESHOLD,
            processing: QUEUE_PROCESSING_THRESHOLD,
            dead: QUEUE_DEAD_THRESHOLD,
          },
        },
        notifier: notifierRuntime,
        surfaces: surfaceStatuses,
      },
      { status: httpStatus }
    );
  });
}

import { ok, fail } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import { getAllSurfaceStatuses } from "@/lib/monitoring/status";
import { getNotificationsNotifierRuntimeStatus, notificationsNotifier } from "@/lib/notifications/notifier";
import { prisma } from "@/lib/prisma";
import { getQueueStats } from "@/lib/queue/queue";
import { getRedisConnection } from "@/lib/redis/connection";

export const runtime = "nodejs";

const WORKER_LAST_PING_KEY = "worker:last-ping";
const WORKER_ALIVE_THRESHOLD_MS = 120_000;
const QUEUE_PENDING_OVERLOAD_THRESHOLD = 1000;
const QUEUE_DEAD_THRESHOLD = 10;
const QUEUE_PROCESSING_THRESHOLD = 50;

function resolveWorkerSecret(): string | null {
  const secret = process.env.WORKER_SECRET?.trim();
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
  if (expectedSecret && providedSecret && providedSecret === expectedSecret) {
    return true;
  }

  const admin = await requireAdminAuth();
  return admin.ok;
}

export async function GET(request: Request) {
  return withRequestContext(request, async () => {
    if (!(await isAuthorized(request))) {
      return fail("Unauthorized", 401, "UNAUTHORIZED");
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
        await redis.ping();
        redisReady = true;
        const lastPingRaw = await redis.get(WORKER_LAST_PING_KEY);
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
      await notificationsNotifier;
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

    const isProduction = process.env.NODE_ENV === "production";
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
        environment: process.env.NODE_ENV ?? "development",
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

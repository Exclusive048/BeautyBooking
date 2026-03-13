import { logError } from "@/lib/logging/logger";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

export const CRITICAL_OBSERVABILITY_SURFACES = [
  "auth",
  "bookings",
  "webhook",
  "media",
  "notifications",
] as const;

export type CriticalObservabilitySurface = (typeof CRITICAL_OBSERVABILITY_SURFACES)[number];
export type SurfaceOutcome = "success" | "failure" | "denied" | "degraded";

export type SurfaceEventInput = {
  surface: CriticalObservabilitySurface;
  outcome: SurfaceOutcome;
  code?: string | null;
  operation?: string | null;
};

export type SurfaceStatusSnapshot = {
  surface: CriticalObservabilitySurface;
  store: "redis" | "memory" | "none";
  lastEventAt: string | null;
  lastOutcome: SurfaceOutcome | null;
  lastOperation: string | null;
  lastCode: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDeniedAt: string | null;
  lastDegradedAt: string | null;
  successCount: number;
  failureCount: number;
  deniedCount: number;
  degradedCount: number;
};

const STATUS_KEY_PREFIX = "mon:status:surface:";
const STATUS_TTL_SECONDS = 7 * 24 * 60 * 60;
const allowMemoryFallback = process.env.NODE_ENV !== "production";
const memoryStore = new Map<CriticalObservabilitySurface, SurfaceStatusSnapshot>();
const PRODUCTION_DEGRADED_MARKER_TTL_MS = 10 * 60 * 1000;
const PRODUCTION_DEGRADED_MARKER_MIN_INTERVAL_MS = 60_000;
const productionDegradedStore = new Map<
  CriticalObservabilitySurface,
  { snapshot: SurfaceStatusSnapshot; markedAtMs: number; expiresAtMs: number }
>();
let lastStoreErrorLogAt = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

function createDefaultSnapshot(
  surface: CriticalObservabilitySurface,
  store: SurfaceStatusSnapshot["store"] = "none"
): SurfaceStatusSnapshot {
  return {
    surface,
    store,
    lastEventAt: null,
    lastOutcome: null,
    lastOperation: null,
    lastCode: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDeniedAt: null,
    lastDegradedAt: null,
    successCount: 0,
    failureCount: 0,
    deniedCount: 0,
    degradedCount: 0,
  };
}

function applyEvent(
  snapshot: SurfaceStatusSnapshot,
  input: SurfaceEventInput,
  eventAt: string
): SurfaceStatusSnapshot {
  const code = sanitizeLabel(input.code);
  const operation = sanitizeLabel(input.operation);
  const next: SurfaceStatusSnapshot = {
    ...snapshot,
    lastEventAt: eventAt,
    lastOutcome: input.outcome,
    lastOperation: operation,
    lastCode: code,
  };

  if (input.outcome === "success") {
    next.successCount += 1;
    next.lastSuccessAt = eventAt;
  } else if (input.outcome === "failure") {
    next.failureCount += 1;
    next.lastFailureAt = eventAt;
  } else if (input.outcome === "denied") {
    next.deniedCount += 1;
    next.lastDeniedAt = eventAt;
  } else if (input.outcome === "degraded") {
    next.degradedCount += 1;
    next.lastDegradedAt = eventAt;
  }

  return next;
}

function toRedisKey(surface: CriticalObservabilitySurface): string {
  return `${STATUS_KEY_PREFIX}${surface}`;
}

function parseInteger(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNullableString(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOutcome(value: string | undefined): SurfaceOutcome | null {
  if (value === "success" || value === "failure" || value === "denied" || value === "degraded") {
    return value;
  }
  return null;
}

function hydrateFromRedis(
  surface: CriticalObservabilitySurface,
  hash: Record<string, string>
): SurfaceStatusSnapshot {
  if (Object.keys(hash).length === 0) {
    return createDefaultSnapshot(surface, "redis");
  }

  return {
    surface,
    store: "redis",
    lastEventAt: parseNullableString(hash.lastEventAt),
    lastOutcome: parseOutcome(hash.lastOutcome),
    lastOperation: parseNullableString(hash.lastOperation),
    lastCode: parseNullableString(hash.lastCode),
    lastSuccessAt: parseNullableString(hash.lastSuccessAt),
    lastFailureAt: parseNullableString(hash.lastFailureAt),
    lastDeniedAt: parseNullableString(hash.lastDeniedAt),
    lastDegradedAt: parseNullableString(hash.lastDegradedAt),
    successCount: parseInteger(hash.successCount),
    failureCount: parseInteger(hash.failureCount),
    deniedCount: parseInteger(hash.deniedCount),
    degradedCount: parseInteger(hash.degradedCount),
  };
}

function maybeLogStoreIssue(message: string, details: Record<string, unknown>): void {
  const now = Date.now();
  if (now - lastStoreErrorLogAt < 60_000) return;
  lastStoreErrorLogAt = now;
  logError(message, { ...details, __skipAlert: true });
}

function applyMemoryEvent(input: SurfaceEventInput, eventAt: string): void {
  const current = memoryStore.get(input.surface) ?? createDefaultSnapshot(input.surface, "memory");
  memoryStore.set(input.surface, applyEvent(current, input, eventAt));
}

function markProductionDegradedSurface(
  surface: CriticalObservabilitySurface,
  code: string,
  operation: string
): void {
  const now = Date.now();
  const existing = productionDegradedStore.get(surface);
  if (existing && now - existing.markedAtMs < PRODUCTION_DEGRADED_MARKER_MIN_INTERVAL_MS) {
    productionDegradedStore.set(surface, {
      ...existing,
      expiresAtMs: now + PRODUCTION_DEGRADED_MARKER_TTL_MS,
    });
    return;
  }

  const eventAt = new Date(now).toISOString();
  const next = applyEvent(
    existing?.snapshot ?? createDefaultSnapshot(surface, "none"),
    {
      surface,
      outcome: "degraded",
      code,
      operation,
    },
    eventAt
  );

  productionDegradedStore.set(surface, {
    snapshot: {
      ...next,
      store: "none",
    },
    markedAtMs: now,
    expiresAtMs: now + PRODUCTION_DEGRADED_MARKER_TTL_MS,
  });
}

function takeProductionDegradedSnapshot(surface: CriticalObservabilitySurface): SurfaceStatusSnapshot | null {
  const item = productionDegradedStore.get(surface);
  if (!item) return null;
  if (item.expiresAtMs <= Date.now()) {
    productionDegradedStore.delete(surface);
    return null;
  }
  return item.snapshot;
}

function clearProductionDegradedSnapshot(surface: CriticalObservabilitySurface): void {
  productionDegradedStore.delete(surface);
}

async function writeRedisEvent(input: SurfaceEventInput, eventAt: string): Promise<boolean> {
  const redis = await getRedisConnection();
  if (!redis) return false;

  const key = toRedisKey(input.surface);
  const next = applyEvent(createDefaultSnapshot(input.surface, "redis"), input, eventAt);

  const fields: Record<string, string> = {
    lastEventAt: next.lastEventAt ?? "",
    lastOutcome: next.lastOutcome ?? "",
    lastOperation: next.lastOperation ?? "",
    lastCode: next.lastCode ?? "",
  };
  if (next.lastSuccessAt) fields.lastSuccessAt = next.lastSuccessAt;
  if (next.lastFailureAt) fields.lastFailureAt = next.lastFailureAt;
  if (next.lastDeniedAt) fields.lastDeniedAt = next.lastDeniedAt;
  if (next.lastDegradedAt) fields.lastDegradedAt = next.lastDegradedAt;

  const multi = redis.multi();
  multi.hSet(key, fields);
  if (input.outcome === "success") multi.hIncrBy(key, "successCount", 1);
  if (input.outcome === "failure") multi.hIncrBy(key, "failureCount", 1);
  if (input.outcome === "denied") multi.hIncrBy(key, "deniedCount", 1);
  if (input.outcome === "degraded") multi.hIncrBy(key, "degradedCount", 1);
  multi.expire(key, STATUS_TTL_SECONDS);
  await withRedisCommandTimeout("monitoring:status:write", multi.exec());

  return true;
}

export async function recordSurfaceEvent(input: SurfaceEventInput): Promise<void> {
  const eventAt = nowIso();
  try {
    const storedInRedis = await writeRedisEvent(input, eventAt);
    if (storedInRedis) {
      clearProductionDegradedSnapshot(input.surface);
      return;
    }

    if (allowMemoryFallback) {
      applyMemoryEvent(input, eventAt);
      return;
    }

    markProductionDegradedSurface(
      input.surface,
      "REDIS_UNAVAILABLE",
      "status-store-write"
    );

    maybeLogStoreIssue("Observability surface event dropped: Redis unavailable", {
      surface: input.surface,
      outcome: input.outcome,
      code: sanitizeLabel(input.code),
    });
  } catch (error) {
    if (allowMemoryFallback) {
      applyMemoryEvent(input, eventAt);
      return;
    }
    markProductionDegradedSurface(
      input.surface,
      "REDIS_WRITE_FAILED",
      "status-store-write"
    );
    maybeLogStoreIssue("Observability surface event dropped: storage write failed", {
      surface: input.surface,
      outcome: input.outcome,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getSurfaceStatus(
  surface: CriticalObservabilitySurface
): Promise<SurfaceStatusSnapshot> {
  try {
    const redis = await getRedisConnection();
    if (redis) {
      const hash = await withRedisCommandTimeout(
        "monitoring:status:read",
        redis.hGetAll(toRedisKey(surface))
      );
      clearProductionDegradedSnapshot(surface);
      return hydrateFromRedis(surface, hash);
    } else if (!allowMemoryFallback) {
      markProductionDegradedSurface(surface, "REDIS_UNAVAILABLE", "status-store-read");
    }
  } catch (error) {
    if (!allowMemoryFallback) {
      markProductionDegradedSurface(surface, "REDIS_READ_FAILED", "status-store-read");
    }
    maybeLogStoreIssue("Observability surface read failed", {
      surface,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (allowMemoryFallback) {
    return memoryStore.get(surface) ?? createDefaultSnapshot(surface, "memory");
  }

  const degradedSnapshot = takeProductionDegradedSnapshot(surface);
  if (degradedSnapshot) return degradedSnapshot;

  return createDefaultSnapshot(surface, "none");
}

export async function getAllSurfaceStatuses(): Promise<
  Record<CriticalObservabilitySurface, SurfaceStatusSnapshot>
> {
  const snapshots = await Promise.all(CRITICAL_OBSERVABILITY_SURFACES.map((surface) => getSurfaceStatus(surface)));
  return {
    auth: snapshots[0],
    bookings: snapshots[1],
    webhook: snapshots[2],
    media: snapshots[3],
    notifications: snapshots[4],
  };
}

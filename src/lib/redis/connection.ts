import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { logError, logInfo } from "@/lib/logging/logger";

type RedisClient = RedisClientType;
type RedisTimeoutError = Error & {
  code: "REDIS_COMMAND_TIMEOUT";
  operation: string;
  timeoutMs: number;
};

const REDIS_URL = process.env.REDIS_URL?.trim() ?? "";
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 3_000;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 2_500;

let commandClientPromise: Promise<RedisClient | null> | null = null;
let subscriberClientPromise: Promise<RedisClient | null> | null = null;

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const REDIS_CONNECT_TIMEOUT_MS = parseTimeoutMs(
  process.env.REDIS_CONNECT_TIMEOUT_MS,
  DEFAULT_REDIS_CONNECT_TIMEOUT_MS
);
const REDIS_COMMAND_TIMEOUT_MS = parseTimeoutMs(
  process.env.REDIS_COMMAND_TIMEOUT_MS,
  DEFAULT_REDIS_COMMAND_TIMEOUT_MS
);

function createRedisTimeoutError(operation: string, timeoutMs: number): RedisTimeoutError {
  const error = new Error(
    `Redis command timeout: operation=${operation}, timeoutMs=${timeoutMs}`
  ) as RedisTimeoutError;
  error.code = "REDIS_COMMAND_TIMEOUT";
  error.operation = operation;
  error.timeoutMs = timeoutMs;
  return error;
}

export function withRedisCommandTimeout<T>(
  operation: string,
  promise: Promise<T>,
  timeoutMs = REDIS_COMMAND_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createRedisTimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function buildClient(role: "command" | "subscriber"): RedisClient {
  const client: RedisClient = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy(retries) {
        return Math.min(retries * 100, 2000);
      },
    },
  });

  client.on("error", (error: unknown) => {
    logError("Redis client error", {
      role,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  client.on("connect", () => {
    logInfo("Redis client connected", { role });
  });
  client.on("reconnecting", () => {
    logInfo("Redis client reconnecting", { role });
  });
  client.on("end", () => {
    logInfo("Redis client disconnected", { role });
  });

  return client;
}

async function getOrCreateClient(
  role: "command" | "subscriber"
): Promise<RedisClient | null> {
  if (!REDIS_URL) return null;
  const target = role === "subscriber" ? subscriberClientPromise : commandClientPromise;
  if (!target) {
    const promise = (async () => {
      const client = buildClient(role);
      try {
        await withRedisCommandTimeout(
          `redis:${role}:connect`,
          client.connect(),
          REDIS_CONNECT_TIMEOUT_MS
        );
        return client;
      } catch (error) {
        void client.disconnect().catch(() => undefined);
        logError("Redis connection failed", {
          role,
          error: error instanceof Error ? error.message : String(error),
        });
        if (role === "subscriber") {
          subscriberClientPromise = null;
        } else {
          commandClientPromise = null;
        }
        return null;
      }
    })();
    if (role === "subscriber") {
      subscriberClientPromise = promise;
    } else {
      commandClientPromise = promise;
    }
  }
  return role === "subscriber" ? subscriberClientPromise : commandClientPromise;
}

export async function getRedisConnection(): Promise<RedisClient | null> {
  return getOrCreateClient("command");
}

export async function getRedisSubscriberConnection(): Promise<RedisClient | null> {
  return getOrCreateClient("subscriber");
}

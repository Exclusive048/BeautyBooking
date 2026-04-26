import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { logError, logInfo } from "@/lib/logging/logger";
import { env } from "@/lib/env";

type RedisClient = RedisClientType;
type RedisTimeoutError = Error & {
  code: "REDIS_COMMAND_TIMEOUT";
  operation: string;
  timeoutMs: number;
};

const REDIS_URL = env.REDIS_URL?.trim() ?? "";
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 3_000;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 2_500;

// Use globalThis to survive HMR module reloads in dev — same pattern as Prisma singleton.
const g = globalThis as typeof globalThis & {
  __bhRedisCommand: Promise<RedisClient | null> | null | undefined;
  __bhRedisSubscriber: Promise<RedisClient | null> | null | undefined;
};
if (g.__bhRedisCommand === undefined) g.__bhRedisCommand = null;
if (g.__bhRedisSubscriber === undefined) g.__bhRedisSubscriber = null;

const REDIS_CONNECT_TIMEOUT_MS =
  env.REDIS_CONNECT_TIMEOUT_MS ?? DEFAULT_REDIS_CONNECT_TIMEOUT_MS;
const REDIS_COMMAND_TIMEOUT_MS =
  env.REDIS_COMMAND_TIMEOUT_MS ?? DEFAULT_REDIS_COMMAND_TIMEOUT_MS;

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
  const current = role === "subscriber" ? g.__bhRedisSubscriber : g.__bhRedisCommand;
  if (!current) {
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
          g.__bhRedisSubscriber = null;
        } else {
          g.__bhRedisCommand = null;
        }
        return null;
      }
    })();
    if (role === "subscriber") {
      g.__bhRedisSubscriber = promise;
    } else {
      g.__bhRedisCommand = promise;
    }
  }
  return role === "subscriber" ? g.__bhRedisSubscriber! : g.__bhRedisCommand!;
}

export async function getRedisConnection(): Promise<RedisClient | null> {
  return getOrCreateClient("command");
}

export async function getRedisSubscriberConnection(): Promise<RedisClient | null> {
  return getOrCreateClient("subscriber");
}

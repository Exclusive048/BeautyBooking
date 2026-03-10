import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { logError, logInfo } from "@/lib/logging/logger";

type RedisClient = RedisClientType;

const REDIS_URL = process.env.REDIS_URL?.trim() ?? "";

let commandClientPromise: Promise<RedisClient | null> | null = null;
let subscriberClientPromise: Promise<RedisClient | null> | null = null;

function buildClient(role: "command" | "subscriber"): RedisClient {
  const client: RedisClient = createClient({
    url: REDIS_URL,
    socket: {
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
      try {
        const client = buildClient(role);
        await client.connect();
        return client;
      } catch (error) {
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

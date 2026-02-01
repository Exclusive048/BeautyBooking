import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { logError, logInfo } from "@/lib/logging/logger";

type RedisClient = RedisClientType;

const REDIS_URL = process.env.REDIS_URL?.trim() ?? "";

let clientPromise: Promise<RedisClient | null> | null = null;

function buildClient(): RedisClient {
  const client: RedisClient = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy(retries) {
        return Math.min(retries * 100, 2000);
      },
    },
  });

  client.on("error", (error: unknown) => {
    logError("Redis client error", { error: error instanceof Error ? error.message : String(error) });
  });
  client.on("connect", () => {
    logInfo("Redis client connected");
  });
  client.on("reconnecting", () => {
    logInfo("Redis client reconnecting");
  });
  client.on("end", () => {
    logInfo("Redis client disconnected");
  });

  return client;
}

export async function getRedisConnection(): Promise<RedisClient | null> {
  if (!REDIS_URL) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const client = buildClient();
        await client.connect();
        return client;
      } catch (error) {
        logError("Redis connection failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        clientPromise = null;
        return null;
      }
    })();
  }
  return clientPromise;
}

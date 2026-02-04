import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL?.trim() ?? "";

if (!redisUrl) {
  console.log("[redis] REDIS_URL is not set, skipping flush.");
  process.exit(0);
}

const client = createClient({ url: redisUrl });

try {
  await client.connect();
  await client.flushDb();
  console.log("[redis] Development cache flushed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[redis] Failed to flush cache: ${message}`);
  process.exitCode = 1;
} finally {
  if (client.isOpen) {
    await client.quit().catch(() => undefined);
  }
}

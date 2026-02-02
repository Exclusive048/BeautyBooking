import { getRedisConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import type { Job } from "@/lib/queue/types";
import { isJob } from "@/lib/queue/types";

const QUEUE_KEY = "queue:jobs";
const memoryQueue: Job[] = [];

function parseJob(raw: string): Job | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isJob(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function enqueue(job: Job): Promise<void> {
  try {
    const client = await getRedisConnection();
    if (!client) {
      memoryQueue.push(job);
      return;
    }
    await client.rPush(QUEUE_KEY, JSON.stringify(job));
  } catch (error) {
    logError("Queue enqueue failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function dequeue(): Promise<Job | null> {
  try {
    const client = await getRedisConnection();
    if (!client) {
      return memoryQueue.shift() ?? null;
    }
    const result = await client.blPop(QUEUE_KEY, 5);
    if (!result) return null;
    const job = parseJob(result.element);
    if (!job) {
      logError("Queue job parse failed", { raw: result.element });
      return null;
    }
    return job;
  } catch (error) {
    logError("Queue dequeue failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

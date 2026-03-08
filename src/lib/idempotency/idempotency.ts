import * as cache from "@/lib/cache/cache";

export type IdempotencyRecord =
  | { status: "pending" }
  | { status: "done"; bookingId: string };

export async function checkAndSetIdempotency(
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  const payload = JSON.stringify({ status: "pending" } satisfies IdempotencyRecord);
  try {
    return await cache.setNx(key, payload, ttlSeconds);
  } catch {
    throw new Error("Service temporarily unavailable");
  }
}

export async function getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
  return cache.get<IdempotencyRecord>(key);
}

export async function setIdempotencyPending(key: string, ttlSeconds: number): Promise<boolean> {
  const payload = JSON.stringify({ status: "pending" } satisfies IdempotencyRecord);
  try {
    return await cache.setNx(key, payload, ttlSeconds);
  } catch {
    throw new Error("Service temporarily unavailable");
  }
}

export async function setIdempotencyResult(
  key: string,
  bookingId: string,
  ttlSeconds: number
): Promise<void> {
  return cache.set(key, { status: "done", bookingId }, ttlSeconds);
}

export async function clearIdempotency(key: string): Promise<void> {
  return cache.del(key);
}

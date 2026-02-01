import * as cache from "@/lib/cache/cache";

export async function checkAndSetIdempotency(
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  return cache.setNx(key, "1", ttlSeconds);
}

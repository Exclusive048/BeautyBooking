import type { CacheClient } from "@/lib/cache/types";

type MemoryEntry = {
  value: string;
  expiresAt: number | null;
};

const store = new Map<string, MemoryEntry>();

function nowMs() {
  return Date.now();
}

function isExpired(entry: MemoryEntry): boolean {
  if (entry.expiresAt === null) return false;
  return entry.expiresAt <= nowMs();
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function matchPattern(pattern: string, key: string): boolean {
  if (pattern === "*") return true;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(key);
}

export const memoryClient: CacheClient = {
  async get<T>(key: string): Promise<T | null> {
    const entry = store.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }
    return parseJson<T>(entry.value);
  },
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = ttlSeconds > 0 ? nowMs() + ttlSeconds * 1000 : null;
    store.set(key, { value: JSON.stringify(value), expiresAt });
  },
  async del(key: string): Promise<void> {
    store.delete(key);
  },
  async delByPattern(pattern: string): Promise<void> {
    for (const key of store.keys()) {
      if (matchPattern(pattern, key)) {
        store.delete(key);
      }
    }
  },
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const existing = store.get(key);
    if (existing && !isExpired(existing)) {
      return false;
    }
    const expiresAt = ttlSeconds > 0 ? nowMs() + ttlSeconds * 1000 : null;
    store.set(key, { value, expiresAt });
    return true;
  },
};

export type CacheClient = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPattern(pattern: string): Promise<void>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
};

import * as cache from "@/lib/cache/cache";

/**
 * LOGIC-09: запись хранит id СОЗДАННОЙ СУЩНОСТИ, а не обязательно брони —
 * пакетные роуты кладут сюда `bookingPackageId`. Поле было названо
 * `bookingId`, и с этим именем пакет пришлось бы либо втискивать в чужую
 * семантику, либо заводить второй такой же модуль.
 */
export type IdempotencyRecord =
  | { status: "pending" }
  | { status: "done"; entityId: string };

/** Форма записей, выпущенных до LOGIC-09. */
type LegacyDoneRecord = { status: "done"; bookingId: string };

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
  const record = await cache.get<IdempotencyRecord | LegacyDoneRecord>(key);
  if (!record) return null;
  // Записи со старым именем поля живут ещё TTL после деплоя; без этой строки
  // они читались бы как `entityId: undefined`, то есть идемпотентность молча
  // отключилась бы ровно на десять минут после выкатки.
  if (record.status === "done" && !("entityId" in record)) {
    return { status: "done", entityId: record.bookingId };
  }
  return record as IdempotencyRecord;
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
  entityId: string,
  ttlSeconds: number
): Promise<void> {
  return cache.set(key, { status: "done", entityId } satisfies IdempotencyRecord, ttlSeconds);
}

export async function clearIdempotency(key: string): Promise<void> {
  return cache.del(key);
}

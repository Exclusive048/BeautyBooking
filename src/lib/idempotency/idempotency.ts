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

/**
 * FIX-C11 — «зависимость недоступна» здесь означает ОТКАЗ, и это не то же самое,
 * что «замок занят».
 *
 * Идемпотентность — обещание «повторный POST не создаст вторую сущность», и без
 * замка выдать его нечем: пропустить запрос значило бы молча снять гарантию, ради
 * которой инвариант #28 и существует. Поэтому единственный корректный ответ —
 * 503-подобный отказ, а не `false` («занято», то есть «дубль») и не `true`.
 */
export async function checkAndSetIdempotency(
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  const payload = JSON.stringify({ status: "pending" } satisfies IdempotencyRecord);
  const claim = await cache.claimLock(key, payload, ttlSeconds);
  if (claim.status === "unavailable") {
    throw new Error("Service temporarily unavailable");
  }
  return claim.status === "acquired";
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

/** Тот же отказ, что и у `checkAndSetIdempotency`, и по той же причине. */
export async function setIdempotencyPending(key: string, ttlSeconds: number): Promise<boolean> {
  const payload = JSON.stringify({ status: "pending" } satisfies IdempotencyRecord);
  const claim = await cache.claimLock(key, payload, ttlSeconds);
  if (claim.status === "unavailable") {
    throw new Error("Service temporarily unavailable");
  }
  return claim.status === "acquired";
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

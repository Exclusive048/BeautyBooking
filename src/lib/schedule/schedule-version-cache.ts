import * as cache from "@/lib/cache/cache";

/**
 * PERF-04 — `scheduleVersion` это КЛЮЧ инвалидации слот-кэша, и до этого он
 * пересчитывался пятью операторами БД (`Provider.updatedAt` + четыре
 * `_max updatedAt` по `ScheduleOverride` / `ScheduleBreak` / `ScheduleTemplate`
 * / `WeeklyScheduleConfig`) на КАЖДЫЙ публичный `/slots` — включая попадание в
 * кэш. То есть пять из тринадцати запросов существовали ровно затем, чтобы
 * вычислить ключ, по которому лежит уже посчитанный ответ.
 *
 * TTL намеренно равен TTL самих слотов (`SLOTS_TTL_SECONDS`): пропущенная
 * инвалидация теперь ограничена сверху ОДНОЙ И ТОЙ ЖЕ величиной во всех
 * измерениях слот-кэша. У броней такая граница была и раньше — они в ключ не
 * входят вовсе и держатся исключительно на `invalidateSlotsForDateKeys`,
 * поэтому «живой» пересчёт версии страховал ровно одно из двух измерений.
 * Нормальный путь — не TTL, а явный сброс из `invalidateSlotsForMaster`, то
 * есть из того же вызова, который уже чистит `slots:{masterId}:*`.
 *
 * Модуль отдельный (а не внутри `slotsCache.ts` / `engine-context.ts`) ровно
 * потому, что его потребители лежат по обе стороны: пишет и читает
 * `engine-context.ts`, сбрасывает `slotsCache.ts`. Общий низкоуровневый модуль
 * без Prisma — единственная форма без импортного цикла.
 */
const SCHEDULE_VERSION_TTL_SECONDS = 120;

export type ScheduleVersionValue = {
  value: string;
  updatedAt: Date | null;
};

/** Дата через кэш проходит строкой (JSON), поэтому храним её явно как ISO. */
type CachedScheduleVersion = {
  value: string;
  updatedAtIso: string | null;
};

export function buildScheduleVersionCacheKey(masterId: string): string {
  return `schedVer:${masterId}`;
}

export async function readCachedScheduleVersion(
  masterId: string
): Promise<ScheduleVersionValue | null> {
  const cached = await cache.get<CachedScheduleVersion>(buildScheduleVersionCacheKey(masterId));
  if (!cached || typeof cached.value !== "string") return null;

  if (cached.updatedAtIso === null) return { value: cached.value, updatedAt: null };
  if (typeof cached.updatedAtIso !== "string") return null;

  const updatedAt = new Date(cached.updatedAtIso);
  if (Number.isNaN(updatedAt.getTime())) return null;

  return { value: cached.value, updatedAt };
}

export async function writeCachedScheduleVersion(
  masterId: string,
  version: ScheduleVersionValue
): Promise<void> {
  await cache.set<CachedScheduleVersion>(
    buildScheduleVersionCacheKey(masterId),
    {
      value: version.value,
      updatedAtIso: version.updatedAt ? version.updatedAt.toISOString() : null,
    },
    SCHEDULE_VERSION_TTL_SECONDS
  );
}

export async function invalidateScheduleVersion(masterId: string): Promise<void> {
  await cache.del(buildScheduleVersionCacheKey(masterId));
}

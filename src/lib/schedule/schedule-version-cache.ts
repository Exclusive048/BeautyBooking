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

/**
 * SCHEDULE-BREAKS-MANY (2026-10-29) — поколение ВЫЧИСЛЕНИЯ расписания. Стоит в
 * начале версии (`resolveScheduleVersion`), а через неё — в ключах `slots:*`,
 * `dayPlan:*` и `bookingDays:*`; и в ключе самой версии, иначе новый код
 * прочитал бы версию, посчитанную прежним, и с ней — его ответы.
 *
 * Версия следит за ДАННЫМИ расписания, а не за кодом: когда при тех же данных
 * меняется результат движка (правило дня, перерывы, окошки), прежние ответы
 * после деплоя ещё до 120 с отдавались бы как есть, а воркер при старте писал
 * бы из них «свободно сегодня» и снимок фильтра «когда» на полчаса вперёд.
 * Поднимайте число вместе с такой правкой движка.
 *
 * 2 — у дня со своими часами только его перерывы (без обеда из графика).
 */
export const SCHEDULE_COMPUTE_GENERATION = 2;

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
  return `schedVer:g${SCHEDULE_COMPUTE_GENERATION}:${masterId}`;
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

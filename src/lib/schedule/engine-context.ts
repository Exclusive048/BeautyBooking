import type { ScheduleOverrideKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { resolvePublishedUntilLocal } from "@/lib/schedule/publish-horizon";
import { parseDateKeyParts } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { SCHEDULE_OVERRIDE_RANGE_ORDER } from "@/lib/schedule/override-order";
import {
  readCachedScheduleVersion,
  writeCachedScheduleVersion,
} from "@/lib/schedule/schedule-version-cache";
import type { DayOfWeek, ScheduleBreakInterval } from "@/lib/domain/schedule";

type ScheduleVersion = {
  value: string;
  updatedAt: Date | null;
};

export type OverrideRow = {
  date: Date;
  kind: ScheduleOverrideKind;
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  templateId: string | null;
  isActive: boolean | null;
  note: string | null;
  reason: string | null;
};

export type BreakRow = {
  date: Date;
  startLocal: string;
  endLocal: string;
};

export type ScheduleWindow = {
  scheduleVersion: string;
  publishedUntilLocal: string;
  scheduleUpdatedAt: Date | null;
};

export type ScheduleContext = {
  providerId: string;
  timezone: string;
  scheduleWindow: ScheduleWindow;
  rule: {
    kind: "WEEKLY";
    timezone: string;
    anchorDate: null;
    payload: {
      weekly: Array<{
        dayOfWeek: DayOfWeek;
        isWorkday: boolean;
        startLocal: string | null;
        endLocal: string | null;
        breaks: ScheduleBreakInterval[];
      }>;
    };
  } | null;
  overridesByDateKey: Map<string, OverrideRow[]>;
  breaksOverrideByDateKey: Map<string, BreakRow[]>;
  templatesById: Map<string, { startLocal: string; endLocal: string; breaks: ScheduleBreakInterval[] }>;
};

function maxDate(dates: Array<Date | null | undefined>): Date | null {
  let max: Date | null = null;
  for (const value of dates) {
    if (!value) continue;
    if (!max || value.getTime() > max.getTime()) {
      max = value;
    }
  }
  return max;
}

function normalizeTimezone(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildRuleFromWeeklyConfig(input: {
  timezone: string;
  days: Array<{ weekday: number; templateId: string | null; isActive: boolean }>;
  templatesById: Map<string, { startLocal: string; endLocal: string; breaks: ScheduleBreakInterval[] }>;
}): ScheduleContext["rule"] {
  if (input.days.length === 0) return null;
  const dayByWeekday = new Map<number, { templateId: string | null; isActive: boolean }>();
  for (const day of input.days) {
    dayByWeekday.set(day.weekday, { templateId: day.templateId, isActive: day.isActive });
  }

  const weekly = Array.from({ length: 7 }, (_, index) => {
    const systemDay = index as DayOfWeek;
    const scheduleWeekday = systemDay === 0 ? 7 : systemDay;
    const day = dayByWeekday.get(scheduleWeekday) ?? null;
    const template = day?.templateId ? input.templatesById.get(day.templateId) ?? null : null;
    const isWorkday = Boolean(day?.isActive && template);

    return {
      dayOfWeek: systemDay,
      isWorkday,
      startLocal: isWorkday ? template?.startLocal ?? null : null,
      endLocal: isWorkday ? template?.endLocal ?? null : null,
      breaks: isWorkday ? template?.breaks ?? [] : [],
    };
  });

  const hasAnyWorkday = weekly.some((item) => item.isWorkday);
  if (!hasAnyWorkday) return null;

  return {
    kind: "WEEKLY",
    timezone: input.timezone,
    anchorDate: null,
    payload: { weekly },
  };
}

function dateKeyToUtcStart(dateKey: string): Date {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) {
    throw new AppError(`Некорректная дата: ${dateKey}.`, 400, "DATE_INVALID");
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

/**
 * Версия расписания = «когда в последний раз менялась СТРУКТУРА расписания».
 *
 * PERF-18 — до этого первым входом был `Provider.updatedAt`, то есть версию
 * двигала ЛЮБАЯ запись в строку провайдера. А пишут в неё вещи, к расписанию
 * отношения не имеющие: пересчёт рейтинга при каждом отзыве
 * (`reviews/recalculate-ratings.ts`), пересчёт `availableToday`
 * (`recompute-available-today.ts` — который сам запускается ИЗ инвалидатора
 * слотов), правки профиля, соцсети, аватар. Версия входит в ключи `slots:*`,
 * `dayPlan:*` и `bookingDays:*`, поэтому её смена осиротняет весь прогретый
 * набор провайдера — все дни × все услуги × все длительности, — тогда как
 * поменялся, скажем, средний балл.
 *
 * Убрать провайдера из версии можно ровно потому, что все его поля, влияющие
 * на результат, уже лежат в ключах САМИ:
 *   - `timezone` — в ключе `slots:*`, `dayPlan:*` и `bookingDays:*`;
 *   - `bufferBetweenBookingsMin` — в ключе `slots:*`;
 *   - `slotStepMin` — добавлен в ключ `slots:*` этой же правкой; он был
 *     единственным входом `buildSlotsForDay`, который держался ТОЛЬКО на
 *     `Provider.updatedAt` (`buildSlotsCacheKey`).
 * Остальные поля (`minBookingHoursAhead`, `visibleSlotDays`,
 * `acceptNewClients`, …) применяются ПОСЛЕ чтения кэша — они сужают выдачу, а
 * не то, что закэшировано.
 *
 * Направление ошибки при этом не поменялось: пропустить изменение структуры
 * нельзя (все таблицы по-прежнему здесь), а лишний ключевой вход мы заменили
 * не на «ничего», а на явное перечисление в самих ключах.
 *
 * PERF-19 — пятая таблица, `TimeBlock`, добавлена сюда позже остальных, и по
 * другой причине. Блокировки времени участвуют в `buildSlotsForDay`
 * (`loadTimeBlockRanges`), но не входили НИ в ключ, ни в версию: их
 * корректность держалась ИСКЛЮЧИТЕЛЬНО на явном `invalidateSlotsForMaster`
 * из `studio/calendar.service.ts`, а тот путь глушит ошибки Redis
 * (`delByPattern` ловит и логирует). То есть один brownout Redis означал
 * заблокированное время, которое до истечения TTL продолжает предлагаться к
 * записи. Теперь у этого есть второй, независимый слой.
 *
 * PERF-04: операторы ниже вычисляют ключ кэша, а не ответ, — поэтому они шли
 * и при попадании в кэш тоже. Сброс — явный, из `invalidateSlotsForMaster`;
 * TTL здесь только верхняя граница на случай пропущенной инвалидации, и он
 * равен TTL самих слотов.
 */
async function resolveScheduleVersion(masterId: string): Promise<ScheduleVersion> {
  const cached = await readCachedScheduleVersion(masterId);
  if (cached) return cached;

  const [overrideMax, overrideBreakMax, templateMax, weeklyConfigMax, timeBlockAgg] =
    await prisma.$transaction([
    prisma.scheduleOverride.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.scheduleBreak.aggregate({
      where: { providerId: masterId, kind: "OVERRIDE" },
      _max: { updatedAt: true },
    }),
    prisma.scheduleTemplate.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.weeklyScheduleConfig.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    // PERF-19: блокировки времени — последний вход слот-кэша, который до сих
    // пор не был представлен в ключе НИЧЕМ. Скоуп тот же, что у
    // `loadTimeBlockRanges` (по `masterId`), иначе версия сторожила бы не то
    // множество, которое читает движок.
    prisma.timeBlock.aggregate({
      where: { masterId },
      _max: { updatedAt: true },
      _count: true,
    }),
  ]);

  const latest = maxDate([
    overrideMax._max.updatedAt ?? null,
    overrideBreakMax._max.updatedAt ?? null,
    templateMax._max.updatedAt ?? null,
    weeklyConfigMax._max.updatedAt ?? null,
    timeBlockAgg._max.updatedAt ?? null,
  ]);

  // Счётчик блокировок — рядом с меткой времени, а не вместо неё: `_max`
  // ловит создание и правку, но НЕ удаление строки, которая не была
  // максимумом (максимум при этом не двигается). Для блокировок это не
  // теоретический случай — они по природе временные, и снятие блокировки
  // обязано вернуть слот. Обе величины идут из одного агрегата, лишнего
  // запроса нет.
  const value = `${latest ? latest.getTime() : 0}:${timeBlockAgg._count}`;
  const version: ScheduleVersion = { value, updatedAt: latest };
  await writeCachedScheduleVersion(masterId, version);
  return version;
}

export async function getScheduleWindow(masterId: string, timeZone: string): Promise<ScheduleWindow> {
  const version = await resolveScheduleVersion(masterId);
  const publishedUntilLocal = resolvePublishedUntilLocal({
    changeAtUtc: version.updatedAt,
    nowUtc: new Date(),
    timeZone,
  });
  return {
    scheduleVersion: version.value,
    publishedUntilLocal,
    scheduleUpdatedAt: version.updatedAt,
  };
}

export async function createScheduleContext(input: {
  providerId: string;
  timezoneHint?: string;
  range?: { fromKey: string; toKeyExclusive: string };
  /**
   * PERF-04. Вызывающий, который УЖЕ прочитал провайдера и разрешил окно
   * расписания (`listAvailabilitySlotsPaginated` обязан сделать это до
   * контекста — из окна строится ключ слот-кэша), передаёт их сюда, а не
   * заставляет перечитывать. Поле всё-или-ничего намеренно: разрешать
   * половину значило бы завести состояние «окно от одной версии, контекст от
   * другой», а ключ, по которому слоты ЧИТАЮТСЯ, обязан совпасть с ключом, по
   * которому они ПИШУТСЯ.
   */
  prefetched?: {
    provider: { id: string; timezone: string };
    scheduleWindow: ScheduleWindow;
  };
}): Promise<ScheduleContext> {
  const provider =
    input.prefetched?.provider ??
    (await prisma.provider.findUnique({
      where: { id: input.providerId },
      select: { id: true, timezone: true },
    }));
  if (!provider) {
    throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  const timezone = normalizeTimezone(input.timezoneHint, provider.timezone);
  const scheduleWindow =
    input.prefetched?.scheduleWindow ?? (await getScheduleWindow(provider.id, timezone));

  // RULE-12-SCHEDULE (FIX-19): these are read-only schedule loads. They were a
  // `prisma.$transaction([...])` whose raw row results (with the WeeklyScheduleConfig
  // id + template CUIDs) were being RSC-flight-serialized into `/u/<master>` — the
  // same mechanism FIX-17 saw for `ownerUserId`. Sequential awaits keep the data +
  // engine output byte-identical (TZ=UTC slots proof) while removing the combined
  // tuple promise that React captured. Also drop the unused `WeeklyScheduleConfig.id`
  // from the select (defense-at-source — never read; only `.days` is used below).
  const weeklyConfig = await prisma.weeklyScheduleConfig.findUnique({
    where: { providerId: provider.id },
    select: {
      days: { select: { weekday: true, templateId: true, isActive: true } },
    },
  });
  const templates = await prisma.scheduleTemplate.findMany({
    where: { providerId: provider.id },
    select: {
      id: true,
      startLocal: true,
      endLocal: true,
      breaks: { select: { startLocal: true, endLocal: true, sortOrder: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const templatesById = new Map<string, { startLocal: string; endLocal: string; breaks: ScheduleBreakInterval[] }>();
  templates.forEach((template) => {
    templatesById.set(template.id, {
      startLocal: template.startLocal,
      endLocal: template.endLocal,
      breaks: template.breaks
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({ startLocal: item.startLocal, endLocal: item.endLocal })),
    });
  });

  const unifiedRuleConfig = weeklyConfig
    ? buildRuleFromWeeklyConfig({
        timezone,
        days: weeklyConfig.days.map((day) => ({
          weekday: day.weekday,
          templateId: day.templateId,
          isActive: day.isActive,
        })),
        templatesById,
      })
    : null;

  const ruleConfig = unifiedRuleConfig;

  let overrides: OverrideRow[] = [];
  let overrideBreaks: BreakRow[] = [];

  if (input.range) {
    const fromUtc = dateKeyToUtcStart(input.range.fromKey);
    const toUtcExclusive = dateKeyToUtcStart(input.range.toKeyExclusive);

    // RULE-12-SCHEDULE (FIX-19): sequential read-only awaits (was a $transaction
    // tuple) — keeps override.templateId internal to the engine while removing the
    // combined tuple promise from RSC flight serialization. Engine output identical.
    const overrideRows = await prisma.scheduleOverride.findMany({
      where: { providerId: provider.id, date: { gte: fromUtc, lt: toUtcExclusive } },
      // LOGIC-11: движок берёт ПЕРВОЕ совпадение по дате (`findOverrideForDate`),
      // поэтому канонической строке надо стоять первой в своей дате.
      orderBy: SCHEDULE_OVERRIDE_RANGE_ORDER,
      select: {
        date: true,
        kind: true,
        isDayOff: true,
        startLocal: true,
        endLocal: true,
        templateId: true,
        isActive: true,
        note: true,
        reason: true,
      },
    });
    const breakRows = await prisma.scheduleBreak.findMany({
      where: {
        providerId: provider.id,
        kind: "OVERRIDE",
        date: { gte: fromUtc, lt: toUtcExclusive },
      },
      select: { date: true, startLocal: true, endLocal: true },
    });

    overrides = overrideRows as OverrideRow[];
    overrideBreaks = breakRows as BreakRow[];
  }

  const overridesByDateKey = new Map<string, OverrideRow[]>();
  for (const row of overrides) {
    const key = toLocalDateKey(row.date, timezone);
    const list = overridesByDateKey.get(key) ?? [];
    list.push(row);
    overridesByDateKey.set(key, list);
  }

  const breaksOverrideByDateKey = new Map<string, BreakRow[]>();
  for (const row of overrideBreaks) {
    const key = toLocalDateKey(row.date, timezone);
    const list = breaksOverrideByDateKey.get(key) ?? [];
    list.push(row);
    breaksOverrideByDateKey.set(key, list);
  }

  return {
    providerId: provider.id,
    timezone,
    scheduleWindow,
    rule: ruleConfig,
    overridesByDateKey,
    breaksOverrideByDateKey,
    templatesById,
  };
}

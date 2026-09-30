import type { Prisma, ScheduleMode, ScheduleOverrideKind } from "@prisma/client";
import { fixedStartsForMode } from "@/lib/schedule/fixed-starts";
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
import type {
  ScheduleRuleConfig,
  ScheduleRuleCycleDay,
  SchedulePeriodConfig,
} from "@/lib/schedule/rule-engine";
import type { TemplateInfo } from "@/lib/schedule/rule-adapters";
import { WEEK_ANCHOR_MONDAY } from "@/lib/schedule/patterns-shared";

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
  scheduleMode: ScheduleMode | null;
  fixedSlotTimes: string[];
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
  /** Периоды графика (SCHEDULE-PATTERNS-01); `null` — у профиля нет ни графика, ни недели. */
  rule: ScheduleRuleConfig | null;
  overridesByDateKey: Map<string, OverrideRow[]>;
  breaksOverrideByDateKey: Map<string, BreakRow[]>;
  templatesById: Map<string, TemplateInfo>;
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

const WEEKLY_DAY_SELECT = {
  weekday: true,
  templateId: true,
  isActive: true,
  scheduleMode: true,
  fixedSlotTimes: true,
} satisfies Prisma.WeeklyScheduleDaySelect;

const TEMPLATE_SELECT = {
  id: true,
  startLocal: true,
  endLocal: true,
  scheduleMode: true,
  fixedSlotTimes: true,
  breaks: { select: { startLocal: true, endLocal: true, sortOrder: true } },
} satisfies Prisma.ScheduleTemplateSelect;

const PATTERN_SELECT = {
  startsOn: true,
  endsOn: true,
  anchorOn: true,
  cycleDays: true,
  days: { select: { position: true, templateId: true } },
} satisfies Prisma.SchedulePatternSelect;

const OVERRIDE_SELECT = {
  date: true,
  kind: true,
  isDayOff: true,
  startLocal: true,
  endLocal: true,
  templateId: true,
  isActive: true,
  note: true,
  reason: true,
  scheduleMode: true,
  fixedSlotTimes: true,
} satisfies Prisma.ScheduleOverrideSelect;

type TemplateRow = {
  id: string;
  startLocal: string;
  endLocal: string;
  scheduleMode: ScheduleMode;
  fixedSlotTimes: string[];
  breaks: Array<{ startLocal: string; endLocal: string; sortOrder: number }>;
};

type PatternRow = {
  startsOn: string | null;
  endsOn: string | null;
  anchorOn: string;
  cycleDays: number;
  days: Array<{ position: number; templateId: string | null }>;
};

type WeeklyDayRow = {
  weekday: number;
  templateId: string | null;
  isActive: boolean;
  scheduleMode: ScheduleMode;
  fixedSlotTimes: string[];
};

function toCycleDay(template: TemplateInfo | null, templateId: string | null): ScheduleRuleCycleDay {
  if (!template) return { isWorkday: false };
  return {
    isWorkday: true,
    startLocal: template.startLocal,
    endLocal: template.endLocal,
    breaks: template.breaks,
    fixedStarts: template.fixedStarts,
    templateId,
  };
}

/** Периоды сохранённого графика (SCHEDULE-PATTERNS-01), по возрастанию начала. */
function buildPatternPeriods(
  patterns: PatternRow[],
  templatesById: Map<string, TemplateInfo>,
): SchedulePeriodConfig[] {
  return patterns
    .slice()
    .sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? ""))
    .map((pattern) => {
      const byPosition = new Map(pattern.days.map((day) => [day.position, day.templateId]));
      const days = Array.from({ length: pattern.cycleDays }, (_, position) => {
        const templateId = byPosition.get(position) ?? null;
        return toCycleDay(templateId ? templatesById.get(templateId) ?? null : null, templateId);
      });
      return {
        startsOn: pattern.startsOn,
        endsOn: pattern.endsOn,
        anchorOn: pattern.anchorOn,
        days,
        source: "pattern" as const,
      };
    });
}

/**
 * Неделя профиля, у которого ещё нет графика (до переноса
 * `backfillWeeklySchedulePatterns`): один период без границ от понедельника.
 * Режим записи у такой недели — на строке дня недели, а не на шаблоне.
 */
function buildLegacyWeekPeriod(
  weeklyDays: WeeklyDayRow[],
  templatesById: Map<string, TemplateInfo>,
): SchedulePeriodConfig {
  const byWeekday = new Map(weeklyDays.map((day) => [day.weekday, day]));
  const days = Array.from({ length: 7 }, (_, position) => {
    // `WeeklyScheduleDay.weekday`: 1 = Пн … 7 = Вс; позиция 0 = Пн.
    const day = byWeekday.get(position + 1) ?? null;
    const template = day?.isActive && day.templateId ? templatesById.get(day.templateId) ?? null : null;
    if (!day || !template) return toCycleDay(null, null);
    return { ...toCycleDay(template, day.templateId), fixedStarts: fixedStartsForMode(day) };
  });
  return { startsOn: null, endsOn: null, anchorOn: WEEK_ANCHOR_MONDAY, days, source: "weekly-legacy" };
}

/**
 * Период пересекает диапазон (без диапазона — любой). Периоды профиля читаются
 * ВСЕ, без фильтра в запросе: их у профиля единицы, а «есть ли у профиля график
 * вообще» решает, действует ли неделя (`assembleScheduleContext`, `hasAnyPattern`).
 */
function patternOverlapsRange(
  pattern: { startsOn: string | null; endsOn: string | null },
  range: { fromKey: string; toKeyExclusive: string } | undefined,
): boolean {
  if (!range) return true;
  return (
    (pattern.endsOn === null || pattern.endsOn >= range.fromKey) &&
    (pattern.startsOn === null || pattern.startsOn < range.toKeyExclusive)
  );
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

  const [overrideMax, overrideBreakMax, templateMax, weeklyConfigMax, timeBlockAgg, patternAgg] =
    await prisma.$transaction([
    // SCHEDULE-PATTERNS-01 (этап 3): счётчик — по той же причине, что у
    // блокировок: «вернуть как по графику» в календаре удаляет строку, которая
    // не обязана быть максимумом по `updatedAt`.
    prisma.scheduleOverride.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
      _count: true,
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
    // SCHEDULE-PATTERNS-01: графики. Счётчик — по той же причине, что у
    // блокировок: удаление периода, который не был максимумом по `updatedAt`,
    // `_max` не сдвигает. Позиции графика неизменяемы (новый график — новые
    // строки), поэтому отдельного агрегата по ним нет.
    prisma.schedulePattern.aggregate({
      where: { providerId: masterId },
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
    patternAgg._max.updatedAt ?? null,
  ]);

  // Счётчик блокировок — рядом с меткой времени, а не вместо неё: `_max`
  // ловит создание и правку, но НЕ удаление строки, которая не была
  // максимумом (максимум при этом не двигается). Для блокировок это не
  // теоретический случай — они по природе временные, и снятие блокировки
  // обязано вернуть слот. Обе величины идут из одного агрегата, лишнего
  // запроса нет.
  const value = `${latest ? latest.getTime() : 0}:${timeBlockAgg._count}:${patternAgg._count}:${overrideMax._count}`;
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
    select: { days: { select: WEEKLY_DAY_SELECT } },
  });
  const templates = await prisma.scheduleTemplate.findMany({
    where: { providerId: provider.id },
    select: TEMPLATE_SELECT,
    orderBy: { createdAt: "asc" },
  });
  const allPatterns = await prisma.schedulePattern.findMany({
    where: { providerId: provider.id },
    select: PATTERN_SELECT,
  });
  const patterns = allPatterns.filter((pattern) => patternOverlapsRange(pattern, input.range));
  // График мог кончиться до диапазона: тогда неделя НЕ действует.
  const hasAnyPattern = allPatterns.length > 0;

  let overrides: OverrideRow[] = [];
  let overrideBreaks: Array<{ date: Date | null; startLocal: string; endLocal: string }> = [];

  if (input.range) {
    const fromUtc = dateKeyToUtcStart(input.range.fromKey);
    const toUtcExclusive = dateKeyToUtcStart(input.range.toKeyExclusive);

    // RULE-12-SCHEDULE (FIX-19): sequential read-only awaits (was a $transaction
    // tuple) — keeps override.templateId internal to the engine while removing the
    // combined tuple promise from RSC flight serialization. Engine output identical.
    overrides = await prisma.scheduleOverride.findMany({
      where: { providerId: provider.id, date: { gte: fromUtc, lt: toUtcExclusive } },
      // LOGIC-11: движок берёт ПЕРВОЕ совпадение по дате (`findOverrideForDate`),
      // поэтому канонической строке надо стоять первой в своей дате.
      orderBy: SCHEDULE_OVERRIDE_RANGE_ORDER,
      select: OVERRIDE_SELECT,
    });
    overrideBreaks = await prisma.scheduleBreak.findMany({
      where: {
        providerId: provider.id,
        kind: "OVERRIDE",
        date: { gte: fromUtc, lt: toUtcExclusive },
      },
      select: { date: true, startLocal: true, endLocal: true },
    });
  }

  return assembleScheduleContext({
    providerId: provider.id,
    timezone,
    scheduleWindow,
    weeklyDays: weeklyConfig?.days ?? null,
    templates,
    patterns,
    hasAnyPattern,
    overrides,
    overrideBreaks,
  });
}

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — версия расписания у контекста, собранного
 * пакетно (`createScheduleContexts`). Такой контекст считает планы дней без
 * кэша: версия нужна только ключу кэша, а пакетный путь её не читает (это
 * стоило бы запроса-агрегата на каждый профиль). `ScheduleEngine` видит метку и
 * в кэш не ходит ни на чтение, ни на запись.
 */
export const UNCACHED_SCHEDULE_VERSION = "uncached";

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — контексты расписания сразу для многих
 * профилей: по одному запросу на таблицу вместо пяти на профиль. Нужен тем,
 * кто спрашивает «работает ли мастер в эти дни» про команду или период
 * (дашборды, загрузка недели, аналитика, календарь студии) — раньше они читали
 * недельную таблицу сами, мимо движка и без «Особых дней».
 *
 * Правило сборки — то же `assembleScheduleContext`, что у одиночного пути.
 */
export async function createScheduleContexts(input: {
  providers: Array<{ id: string; timezone: string }>;
  range: { fromKey: string; toKeyExclusive: string };
  now?: Date;
}): Promise<Map<string, ScheduleContext>> {
  const result = new Map<string, ScheduleContext>();
  if (input.providers.length === 0) return result;

  const providerIds = input.providers.map((provider) => provider.id);
  const fromUtc = dateKeyToUtcStart(input.range.fromKey);
  const toUtcExclusive = dateKeyToUtcStart(input.range.toKeyExclusive);
  const nowUtc = input.now ?? new Date();

  const weeklyConfigs = await prisma.weeklyScheduleConfig.findMany({
    where: { providerId: { in: providerIds } },
    select: { providerId: true, days: { select: WEEKLY_DAY_SELECT } },
  });
  const templates = await prisma.scheduleTemplate.findMany({
    where: { providerId: { in: providerIds } },
    select: { providerId: true, ...TEMPLATE_SELECT },
    orderBy: { createdAt: "asc" },
  });
  const allPatterns = await prisma.schedulePattern.findMany({
    where: { providerId: { in: providerIds } },
    select: { providerId: true, ...PATTERN_SELECT },
  });
  // Кто вообще живёт по графику — по всем периодам, не только по диапазону.
  const providersWithPatterns = new Set(allPatterns.map((row) => row.providerId));
  const patterns = allPatterns.filter((pattern) => patternOverlapsRange(pattern, input.range));
  const overrides = await prisma.scheduleOverride.findMany({
    where: { providerId: { in: providerIds }, date: { gte: fromUtc, lt: toUtcExclusive } },
    orderBy: SCHEDULE_OVERRIDE_RANGE_ORDER,
    select: { providerId: true, ...OVERRIDE_SELECT },
  });
  const overrideBreaks = await prisma.scheduleBreak.findMany({
    where: {
      providerId: { in: providerIds },
      kind: "OVERRIDE",
      date: { gte: fromUtc, lt: toUtcExclusive },
    },
    select: { providerId: true, date: true, startLocal: true, endLocal: true },
  });

  const daysByProvider = new Map(weeklyConfigs.map((config) => [config.providerId, config.days]));
  const templatesByProvider = groupByProvider(templates);
  const patternsByProvider = groupByProvider(patterns);
  const overridesByProvider = groupByProvider(overrides);
  const breaksByProvider = groupByProvider(overrideBreaks);

  for (const provider of input.providers) {
    const timezone = normalizeTimezone(provider.timezone, "Europe/Moscow");
    result.set(
      provider.id,
      assembleScheduleContext({
        providerId: provider.id,
        timezone,
        scheduleWindow: {
          scheduleVersion: UNCACHED_SCHEDULE_VERSION,
          publishedUntilLocal: resolvePublishedUntilLocal({
            changeAtUtc: null,
            nowUtc,
            timeZone: timezone,
          }),
          scheduleUpdatedAt: null,
        },
        weeklyDays: daysByProvider.get(provider.id) ?? null,
        templates: templatesByProvider.get(provider.id) ?? [],
        patterns: patternsByProvider.get(provider.id) ?? [],
        hasAnyPattern: providersWithPatterns.has(provider.id),
        overrides: overridesByProvider.get(provider.id) ?? [],
        overrideBreaks: breaksByProvider.get(provider.id) ?? [],
      }),
    );
  }
  return result;
}

function groupByProvider<T extends { providerId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.providerId) ?? [];
    list.push(row);
    map.set(row.providerId, list);
  }
  return map;
}

/**
 * Сборка контекста из прочитанных строк — чистая функция, общая для
 * одиночного (`createScheduleContext`) и пакетного (`createScheduleContexts`)
 * путей. Порядок строк исключений должен быть каноническим
 * (`SCHEDULE_OVERRIDE_RANGE_ORDER`): движок берёт первое совпадение по дате.
 */
function assembleScheduleContext(input: {
  providerId: string;
  timezone: string;
  scheduleWindow: ScheduleWindow;
  weeklyDays: WeeklyDayRow[] | null;
  templates: TemplateRow[];
  /** Периоды графика, пересекающие диапазон. */
  patterns: PatternRow[];
  /**
   * Есть ли у профиля график ВООБЩЕ, без фильтра по датам. Неделя
   * (`WeeklyScheduleConfig`) действует только у профиля без графика; у профиля,
   * чей график кончился до диапазона, дни закрыты — а не открыты заново по
   * старой неделе (решение владельца: расписание действует ровно до настроенной даты).
   */
  hasAnyPattern: boolean;
  overrides: OverrideRow[];
  /** `date` в схеме nullable (перерыв недели); здесь приходят только перерывы дат. */
  overrideBreaks: Array<{ date: Date | null; startLocal: string; endLocal: string }>;
}): ScheduleContext {
  const { timezone } = input;

  const templatesById = new Map<string, TemplateInfo>();
  input.templates.forEach((template) => {
    templatesById.set(template.id, {
      startLocal: template.startLocal,
      endLocal: template.endLocal,
      breaks: template.breaks
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({ startLocal: item.startLocal, endLocal: item.endLocal })),
      fixedStarts: fixedStartsForMode(template),
    });
  });

  // SCHEDULE-PATTERNS-01: у профиля с графиком действует ТОЛЬКО график —
  // неделя `WeeklyScheduleConfig` для него история до переноса. У профиля без
  // графика (перенос ещё не прошёл) неделя читается как один период без границ.
  const periods =
    input.patterns.length > 0
      ? buildPatternPeriods(input.patterns, templatesById)
      : !input.hasAnyPattern && input.weeklyDays
        ? [buildLegacyWeekPeriod(input.weeklyDays, templatesById)]
        : [];
  const ruleConfig: ScheduleRuleConfig | null = periods.length > 0 ? { timezone, periods } : null;

  const overridesByDateKey = new Map<string, OverrideRow[]>();
  for (const row of input.overrides) {
    const key = toLocalDateKey(row.date, timezone);
    const list = overridesByDateKey.get(key) ?? [];
    list.push(row);
    overridesByDateKey.set(key, list);
  }

  const breaksOverrideByDateKey = new Map<string, BreakRow[]>();
  for (const row of input.overrideBreaks) {
    if (!row.date) continue;
    const key = toLocalDateKey(row.date, timezone);
    const list = breaksOverrideByDateKey.get(key) ?? [];
    list.push({ date: row.date, startLocal: row.startLocal, endLocal: row.endLocal });
    breaksOverrideByDateKey.set(key, list);
  }

  return {
    providerId: input.providerId,
    timezone,
    scheduleWindow: input.scheduleWindow,
    rule: ruleConfig,
    overridesByDateKey,
    breaksOverrideByDateKey,
    templatesById,
  };
}

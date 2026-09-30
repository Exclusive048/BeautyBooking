import "server-only";

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import {
  AUTO_TEMPLATE_PREFIX,
  buildDefaultWeekSchedule,
  mapTemplateForDay,
  normalizeFixedSlotTimes,
  parseDateKeyToUtcStart,
  type DayScheduleDto,
} from "@/lib/schedule/editor-shared";
import { paletteColorKey } from "@/lib/schedule/calendar-shared";
import {
  createPeriodTx,
  ensureAutoTemplateTx,
  ensurePatternHistoryTx,
} from "@/lib/schedule/patterns-core";
import {
  MAX_PATTERN_CYCLE_DAYS,
  WEEK_ANCHOR_MONDAY,
  isMondayKey,
  patternPosition,
  type DayTemplateDto,
  type ScheduleModeValue,
  type SchedulePatternDto,
  type SchedulePatternKindValue,
  type SchedulePlanDto,
} from "@/lib/schedule/patterns-shared";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — ЕДИНСТВЕННЫЙ писатель графиков
 * (`SchedulePattern`). Решения владельца 2026-09-28: график с датами
 * (неделя, чередование недель, N через M), расписание действует ровно на
 * столько, на сколько настроено (не дальше 3 месяцев), по желанию —
 * «продлевать автоматически» (`endsOn = null`).
 *
 * Инварианты, которые держит этот модуль:
 *   - периоды одного профиля не пересекаются: новый период обрезает старые
 *     (`planPeriodWrite`), поэтому на любую дату график однозначен;
 *   - прошлое не переписывается: новый период начинается не раньше сегодня,
 *     прошлые дни остаются с тем графиком, по которому работали;
 *   - у профиля с графиком неделя `WeeklyScheduleConfig` — история до
 *     переноса: первая же запись переносит её в период «с начала времён»
 *     (`ensurePatternHistoryTx`), дальше пишутся только графики.
 */

type Db = Prisma.TransactionClient;

// ─── Шаблоны рабочих дней (ядро — `patterns-core.ts`) ───────────────────────

/**
 * Шаблоны редактора, на которые больше никто не ссылается — ни график (в том
 * числе прошлый), ни неделя, ни «Особый день». Шаблон, которому человек дал
 * имя в палитре (`label`, этап 3), — его выбор, а не побочный продукт
 * редактора: он не удаляется.
 */
export async function deleteUnusedAutoTemplatesTx(tx: Db, providerId: string): Promise<void> {
  await tx.scheduleTemplate.deleteMany({
    where: {
      providerId,
      name: { startsWith: AUTO_TEMPLATE_PREFIX },
      label: null,
      patternDays: { none: {} },
      weeklyScheduleDays: { none: {} },
      scheduleOverrides: { none: {} },
    },
  });
}

// ─── Периоды ─────────────────────────────────────────────────────────────────

export type StoredPeriod = SchedulePatternDto & { id: string };

const PERIOD_SELECT = {
  id: true,
  kind: true,
  cycleDays: true,
  anchorOn: true,
  startsOn: true,
  endsOn: true,
  days: { select: { position: true, templateId: true }, orderBy: { position: "asc" } },
} satisfies Prisma.SchedulePatternSelect;

type PeriodRow = Prisma.SchedulePatternGetPayload<{ select: typeof PERIOD_SELECT }>;

function toPeriodDto(row: PeriodRow): StoredPeriod {
  const byPosition = new Map(row.days.map((day) => [day.position, day.templateId]));
  return {
    id: row.id,
    kind: row.kind,
    cycleDays: row.cycleDays,
    anchorOn: row.anchorOn,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    days: Array.from({ length: row.cycleDays }, (_, position) => byPosition.get(position) ?? null),
  };
}

export type PeriodWriteOp =
  | { op: "trimEnd"; id: string; endsOn: string }
  | { op: "trimStart"; id: string; startsOn: string }
  | { op: "delete"; id: string }
  | { op: "create"; period: SchedulePatternDto };

/**
 * Чистый план записи периода `next` поверх существующих: что обрезать, что
 * удалить, что создать. Периоды не пересекаются до записи — не пересекаются
 * и после: у старого периода остаётся часть ДО `next`.
 *
 * Что ПОСЛЕ `next`, решает `resumePrevious`:
 *   - `false` (умолчание) — после конца нового графика ничего: расписание
 *     кончается там, где его настроили (решение владельца 2026-09-28), всё
 *     старое с даты начала удаляется;
 *   - `true` — «потом вернуть прежний график»: после конца `next` остаётся
 *     прежний график (копией), как у «летом по-другому, потом как было».
 */
export function planPeriodWrite(
  existing: StoredPeriod[],
  next: SchedulePatternDto & { startsOn: string },
  options: { resumePrevious?: boolean } = {},
): PeriodWriteOp[] {
  const ops: PeriodWriteOp[] = [];
  const start = next.startsOn;
  // Граница, до которой новый график вытесняет старый: его конец — только при
  // возврате прежнего графика, иначе всё начиная с `start`.
  const end = options.resumePrevious ? next.endsOn : null;

  for (const period of existing) {
    const endsBefore = period.endsOn !== null && period.endsOn < start;
    const startsAfter = end !== null && period.startsOn !== null && period.startsOn > end;
    if (endsBefore || startsAfter) continue;

    const keepLeft = period.startsOn === null || period.startsOn < start;
    const keepRight = end !== null && (period.endsOn === null || period.endsOn > end);

    if (keepLeft) {
      ops.push({ op: "trimEnd", id: period.id, endsOn: addDaysToDateKey(start, -1) });
      if (keepRight) {
        const { id: _id, ...rest } = period;
        void _id;
        ops.push({ op: "create", period: { ...rest, startsOn: addDaysToDateKey(end, 1) } });
      }
    } else if (keepRight) {
      ops.push({ op: "trimStart", id: period.id, startsOn: addDaysToDateKey(end, 1) });
    } else {
      ops.push({ op: "delete", id: period.id });
    }
  }

  ops.push({ op: "create", period: next });
  return ops;
}

async function applyPeriodOpsTx(tx: Db, providerId: string, ops: PeriodWriteOp[]): Promise<void> {
  for (const op of ops) {
    if (op.op === "trimEnd") {
      await tx.schedulePattern.update({ where: { id: op.id }, data: { endsOn: op.endsOn } });
    } else if (op.op === "trimStart") {
      await tx.schedulePattern.update({ where: { id: op.id }, data: { startsOn: op.startsOn } });
    } else if (op.op === "delete") {
      await tx.schedulePattern.delete({ where: { id: op.id } });
    } else {
      await createPeriodTx(tx, providerId, op.period);
    }
  }
}

/**
 * Рабочий день палитры, который график ставит на дату (`null` — выходной или
 * дата вне всех периодов). Без правок календаря — это то, к чему день вернётся
 * по «как по графику».
 */
export function periodTemplateIdOn(periods: SchedulePatternDto[], dateKey: string): string | null {
  const period = periods.find(
    (item) =>
      (item.startsOn === null || item.startsOn <= dateKey) && (item.endsOn === null || item.endsOn >= dateKey),
  );
  if (!period) return null;
  return period.days[patternPosition(dateKey, period.anchorOn, period.cycleDays)] ?? null;
}

export async function loadPeriodsTx(tx: Db, providerId: string): Promise<StoredPeriod[]> {
  const rows = await tx.schedulePattern.findMany({
    where: { providerId },
    select: PERIOD_SELECT,
    orderBy: { startsOn: { sort: "asc", nulls: "first" } },
  });
  return rows.map(toPeriodDto);
}

// ─── Проверка входа ──────────────────────────────────────────────────────────

function patternError(message: string): AppError {
  return new AppError(message, 400, "SCHEDULE_PATTERN_INVALID");
}

const WEEKS_CYCLE_LENGTHS = new Set([14, 21, 28]);

/**
 * Проверка и нормализация периода от пользователя. Неделя приводится к общему
 * понедельнику (`WEEK_ANCHOR_MONDAY`), чтобы одинаковые недели хранились
 * одинаково.
 */
export function normalizePatternInput(
  input: {
    kind: SchedulePatternKindValue;
    cycleDays: number;
    anchorOn: string;
    startsOn: string;
    endsOn: string | null;
    days: Array<string | null>;
  },
  todayKey: string,
): SchedulePatternDto & { startsOn: string } {
  const { kind, cycleDays, anchorOn, startsOn, endsOn, days } = input;
  if (!Number.isInteger(cycleDays) || cycleDays < 1 || cycleDays > MAX_PATTERN_CYCLE_DAYS) {
    throw patternError(`В графике может быть от 1 до ${MAX_PATTERN_CYCLE_DAYS} дней.`);
  }
  if (days.length !== cycleDays) throw patternError("Проверьте дни графика.");
  if (kind === "WEEK" && cycleDays !== 7) throw patternError("В недельном графике 7 дней.");
  if (kind === "WEEKS" && !WEEKS_CYCLE_LENGTHS.has(cycleDays)) {
    throw patternError("Чередовать можно 2, 3 или 4 недели.");
  }
  if (!isDateKey(anchorOn) || !isDateKey(startsOn) || (endsOn !== null && !isDateKey(endsOn))) {
    throw patternError("Проверьте даты графика.");
  }
  if ((kind === "WEEK" || kind === "WEEKS") && !isMondayKey(anchorOn)) {
    throw patternError("Недельный график начинается с понедельника.");
  }
  if (startsOn < todayKey) throw patternError("График не может начинаться в прошлом.");
  const lastAllowed = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  if (startsOn > lastAllowed) throw patternError("График можно начать не позже чем через 3 месяца.");
  if (endsOn !== null) {
    if (endsOn < startsOn) throw patternError("Дата окончания раньше даты начала.");
    if (endsOn > lastAllowed) throw patternError("Расписание можно настроить не дальше чем на 3 месяца вперёд.");
  }

  return {
    kind,
    cycleDays,
    // Любой понедельник даёт ту же раскладку недели — храним общий.
    anchorOn: kind === "WEEK" ? WEEK_ANCHOR_MONDAY : anchorOn,
    startsOn,
    endsOn,
    days,
  };
}

async function assertOwnTemplatesTx(tx: Db, providerId: string, days: Array<string | null>): Promise<void> {
  const ids = Array.from(new Set(days.filter((id): id is string => id !== null)));
  if (ids.length === 0) return;
  const owned = await tx.scheduleTemplate.count({ where: { providerId, id: { in: ids } } });
  if (owned !== ids.length) throw patternError("В графике рабочий день из чужой палитры.");
}

// ─── Запись ──────────────────────────────────────────────────────────────────

/** Записать период графика (с обрезкой соседних). Инвалидацию кэша делает вызывающий после коммита. */
export async function writeSchedulePeriodTx(
  tx: Db,
  providerId: string,
  next: SchedulePatternDto & { startsOn: string },
  options: { resumePrevious?: boolean } = {},
): Promise<void> {
  await assertOwnTemplatesTx(tx, providerId, next.days);
  await ensurePatternHistoryTx(tx, providerId);
  const existing = await loadPeriodsTx(tx, providerId);
  await applyPeriodOpsTx(tx, providerId, planPeriodWrite(existing, next, options));
}

/**
 * «Настроено до» / «продлевать автоматически». `endsOn = null` — последний
 * период становится бессрочным; дата — расписание кончается в неё, периоды
 * после неё удаляются. Не дальше горизонта и не раньше сегодня.
 */
export async function setScheduleEndTx(
  tx: Db,
  providerId: string,
  endsOn: string | null,
  todayKey: string,
): Promise<void> {
  await ensurePatternHistoryTx(tx, providerId);
  const periods = await loadPeriodsTx(tx, providerId);
  if (periods.length === 0) throw patternError("Сначала настройте график.");

  if (endsOn === null) {
    const last = periods[periods.length - 1];
    await tx.schedulePattern.update({ where: { id: last.id }, data: { endsOn: null } });
    return;
  }

  if (!isDateKey(endsOn) || endsOn < todayKey) throw patternError("Проверьте дату окончания.");
  if (endsOn > addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS)) {
    throw patternError("Расписание можно настроить не дальше чем на 3 месяца вперёд.");
  }
  for (const period of periods) {
    if (period.startsOn !== null && period.startsOn > endsOn) {
      await tx.schedulePattern.delete({ where: { id: period.id } });
    } else if (period.endsOn === null || period.endsOn > endsOn) {
      await tx.schedulePattern.update({ where: { id: period.id }, data: { endsOn } });
    }
  }
}

// ─── Неделя редактора «Часы» поверх графиков ─────────────────────────────────

type WeekState = "none" | "legacy" | "pattern";

function allOffWeek(): DayScheduleDto[] {
  return buildDefaultWeekSchedule().map((day) => ({ ...day, isWorkday: false }));
}

type TemplateForDto = {
  startLocal: string;
  endLocal: string;
  scheduleMode: ScheduleModeValue;
  fixedSlotTimes: string[];
  breaks: Array<{ startLocal: string; endLocal: string; sortOrder: number; title: string | null }>;
};

function dayFromTemplate(dayOfWeek: number, template: TemplateForDto, mode?: ScheduleModeValue, times?: string[]): DayScheduleDto {
  const scheduleMode = mode ?? template.scheduleMode;
  return {
    dayOfWeek,
    isWorkday: true,
    scheduleMode,
    startTime: template.startLocal,
    endTime: template.endLocal,
    breaks: template.breaks
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({ start: item.startLocal, end: item.endLocal, title: item.title ?? null })),
    fixedSlotTimes: normalizeFixedSlotTimes(times ?? template.fixedSlotTimes),
  };
}

const TEMPLATE_DTO_SELECT = {
  id: true,
  name: true,
  color: true,
  startLocal: true,
  endLocal: true,
  scheduleMode: true,
  fixedSlotTimes: true,
  breaks: { select: { startLocal: true, endLocal: true, sortOrder: true, title: true } },
} satisfies Prisma.ScheduleTemplateSelect;

/**
 * Неделя, которую показывает вкладка «Часы»:
 *   - `pattern` — недельный период, действующий сегодня; если сегодня
 *     действует не неделя (2 через 2, чередование) или расписание кончилось —
 *     все дни выходные (вкладка «Часы» такой график не показывает);
 *   - `legacy` — неделя профиля без графика (до переноса);
 *   - `none` — расписания нет вовсе: неделя по умолчанию, как и до этапа 2.
 */
export async function readWeekRepresentation(
  db: Db,
  providerId: string,
  todayKey: string,
): Promise<{ state: WeekState; week: DayScheduleDto[] }> {
  const periods = await loadPeriodsTx(db, providerId);
  if (periods.length > 0) {
    const current = periods.find(
      (period) =>
        (period.startsOn === null || period.startsOn <= todayKey) &&
        (period.endsOn === null || period.endsOn >= todayKey),
    );
    if (!current || current.kind !== "WEEK" || current.cycleDays !== 7) {
      return { state: "pattern", week: allOffWeek() };
    }
    const ids = current.days.filter((id): id is string => id !== null);
    const templates = await db.scheduleTemplate.findMany({
      where: { providerId, id: { in: ids } },
      select: TEMPLATE_DTO_SELECT,
    });
    const byId = new Map(templates.map((template) => [template.id, template]));
    const week = allOffWeek().map((day, position) => {
      // Позиция 0 = понедельник: недели хранятся от `WEEK_ANCHOR_MONDAY`.
      const templateId = current.days[position];
      const template = templateId ? byId.get(templateId) : undefined;
      return template ? dayFromTemplate(position, template) : day;
    });
    return { state: "pattern", week };
  }

  const config = await db.weeklyScheduleConfig.findUnique({
    where: { providerId },
    select: {
      days: {
        select: {
          weekday: true,
          isActive: true,
          scheduleMode: true,
          fixedSlotTimes: true,
          template: { select: TEMPLATE_DTO_SELECT },
        },
      },
    },
  });
  if (!config) return { state: "none", week: buildDefaultWeekSchedule() };

  const week = buildDefaultWeekSchedule();
  for (const day of config.days) {
    const index = day.weekday - 1;
    if (index < 0 || index > 6) continue;
    if (day.template) {
      // Выключенный день показывает часы своего шаблона — при включении в
      // «Часах» они вернутся (так было и до этапа 2).
      week[index] = {
        ...dayFromTemplate(index, day.template, day.scheduleMode, day.fixedSlotTimes),
        isWorkday: day.isActive,
      };
    } else {
      week[index] = {
        ...week[index],
        isWorkday: false,
        scheduleMode: day.scheduleMode,
        fixedSlotTimes: normalizeFixedSlotTimes(day.fixedSlotTimes),
        breaks: [],
      };
    }
  }
  return { state: "legacy", week };
}

/** Каноническая форма недели для сравнения «изменилось ли что-то». */
export function weekSignature(week: DayScheduleDto[]): string {
  return JSON.stringify(
    week
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((day) => {
        if (!day.isWorkday) return null;
        if (day.scheduleMode === "FIXED") return { fixed: normalizeFixedSlotTimes(day.fixedSlotTimes) };
        return {
          start: day.startTime,
          end: day.endTime,
          breaks: day.breaks.map((entry) => [entry.start, entry.end, entry.title ?? null]),
        };
      }),
  );
}

/**
 * Правка недели во вкладке «Часы»: с сегодняшнего дня действует новая неделя,
 * прошлые дни остаются с прежним графиком, запланированные после конца
 * текущего периода графики — тоже (`resumePrevious`). Конец расписания наследуется от
 * периода, действующего сегодня (у вкладки «Часы» своей даты окончания нет);
 * если сегодня расписания нет — неделя бессрочная, как было до этапа 2.
 *
 * Неделя, которая не изменилась, не пишется вовсе: снапшот настроек
 * отправляет её при сохранении ЛЮБОЙ вкладки, и без этой проверки каждая
 * правка правил записи резала бы график на «до сегодня» и «с сегодня».
 * Исключение — профиль без расписания вовсе: ему, как и до этапа 2, любое
 * сохранение записывает неделю по умолчанию.
 */
export async function saveWeekAsPatternTx(
  tx: Db,
  providerId: string,
  weekSchedule: DayScheduleDto[],
): Promise<void> {
  const provider = await tx.provider.findUnique({
    where: { id: providerId },
    select: { timezone: true },
  });
  if (!provider) throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  const todayKey = toLocalDateKey(new Date(), provider.timezone);

  const current = await readWeekRepresentation(tx, providerId, todayKey);
  if (current.state !== "none" && weekSignature(current.week) === weekSignature(weekSchedule)) return;

  await ensurePatternHistoryTx(tx, providerId);

  const days: Array<string | null> = [];
  for (const day of weekSchedule.slice().sort((a, b) => a.dayOfWeek - b.dayOfWeek)) {
    if (!day.isWorkday) {
      days.push(null);
      continue;
    }
    const mapped = mapTemplateForDay(day);
    days.push(
      await ensureAutoTemplateTx(tx, providerId, {
        startTime: mapped.startLocal,
        endTime: mapped.endLocal,
        breaks: mapped.breaks,
        scheduleMode: day.scheduleMode,
        fixedSlotTimes: day.fixedSlotTimes,
      }),
    );
  }

  const periods = await loadPeriodsTx(tx, providerId);
  const coveringToday = periods.find(
    (period) =>
      (period.startsOn === null || period.startsOn <= todayKey) &&
      (period.endsOn === null || period.endsOn >= todayKey),
  );
  // Сегодня расписания нет, а впереди запланирован другой график — неделя
  // заполняет только промежуток до него, а не стирает его.
  const nextStart = periods
    .map((period) => period.startsOn)
    .filter((start): start is string => start !== null && start > todayKey)
    .sort()[0];
  const endsOn = coveringToday
    ? coveringToday.endsOn
    : nextStart
      ? addDaysToDateKey(nextStart, -1)
      : null;

  await applyPeriodOpsTx(
    tx,
    providerId,
    planPeriodWrite(periods, {
      kind: "WEEK",
      cycleDays: 7,
      anchorOn: WEEK_ANCHOR_MONDAY,
      startsOn: todayKey,
      endsOn,
      days,
    }, { resumePrevious: true }),
  );
  await deleteUnusedAutoTemplatesTx(tx, providerId);
}

// ─── Чтение для кабинета ─────────────────────────────────────────────────────

/** График мастера на сегодня: действующий период, запланированные, «настроено до», палитра. */
export async function loadSchedulePlan(providerId: string, now = new Date()): Promise<SchedulePlanDto> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { timezone: true },
  });
  if (!provider) throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  const todayKey = toLocalDateKey(now, provider.timezone);

  const todayStart = parseDateKeyToUtcStart(todayKey);
  const [rows, templates, hasLegacyWeek] = await Promise.all([
    prisma.schedulePattern.findMany({
      where: { providerId, OR: [{ endsOn: null }, { endsOn: { gte: todayKey } }] },
      select: PERIOD_SELECT,
      orderBy: { startsOn: { sort: "asc", nulls: "first" } },
    }),
    prisma.scheduleTemplate.findMany({
      where: { providerId },
      select: {
        ...TEMPLATE_DTO_SELECT,
        label: true,
        _count: {
          select: {
            // include-ok: счётчики, а не выборка строк.
            patternDays: true,
            // include-ok: счётчик, а не выборка строк.
            weeklyScheduleDays: true,
            // «Особый день» в прошлом держит свою копию часов (`SetNull` при
            // удалении шаблона), будущий — нет: он и есть расписание.
            scheduleOverrides: { where: { date: { gte: todayStart } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.weeklyScheduleConfig.count({
      where: { providerId, days: { some: { isActive: true, templateId: { not: null } } } },
    }),
  ]);
  const totalPatterns = rows.length > 0 ? rows.length : await prisma.schedulePattern.count({ where: { providerId } });
  const periods = rows.map(toPeriodDto).map(({ id: _id, ...period }) => {
    void _id;
    return period;
  });

  const current =
    periods.find(
      (period) =>
        (period.startsOn === null || period.startsOn <= todayKey) &&
        (period.endsOn === null || period.endsOn >= todayKey),
    ) ?? null;
  const upcoming = periods.filter((period) => period.startsOn !== null && period.startsOn > todayKey);
  const last = periods[periods.length - 1] ?? null;

  // Профиль без графика, но с неделей (до переноса): неделя бессрочна.
  const legacy = totalPatterns === 0 && hasLegacyWeek > 0;

  const scheduledIds = new Set(periods.flatMap((period) => period.days).filter((id): id is string => id !== null));
  const paletteFlags = templates.map((template) => {
    const counts = template._count;
    const inUse = counts.patternDays > 0 || counts.weeklyScheduleDays > 0 || counts.scheduleOverrides > 0;
    const inPalette =
      template.label !== null ||
      scheduledIds.has(template.id) ||
      counts.scheduleOverrides > 0 ||
      (legacy && counts.weeklyScheduleDays > 0);
    return { inUse, inPalette };
  });
  // Цвет без сохранённого ключа — по порядку среди дней палитры (стабильно:
  // шаблоны идут по дате создания).
  let paletteIndex = 0;

  return {
    todayKey,
    current,
    upcoming,
    configuredUntil: legacy ? null : last?.endsOn ?? null,
    hasSchedule: legacy || periods.length > 0,
    templates: templates.map((template, index): DayTemplateDto => {
      const { inUse, inPalette } = paletteFlags[index]!;
      const color = paletteColorKey(template.color, inPalette ? paletteIndex++ : 0);
      return {
        id: template.id,
        // Имя от человека — только `label` (этап 3): `name` — технический ключ,
        // а у сидов и старых шаблонов там служебные строки.
        name: template.label,
        color,
        inUse,
        inPalette,
        startTime: template.startLocal,
        endTime: template.endLocal,
        breaks: template.breaks
          .slice()
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((item) => ({ start: item.startLocal, end: item.endLocal, title: item.title ?? null })),
        scheduleMode: template.scheduleMode,
        fixedSlotTimes: normalizeFixedSlotTimes(template.fixedSlotTimes),
      };
    }),
  };
}

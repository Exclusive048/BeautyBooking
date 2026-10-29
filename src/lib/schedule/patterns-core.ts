import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  assignPaletteColors,
  nextPaletteColor,
  type ScheduleDayColorKey,
} from "@/lib/schedule/calendar-shared";
import {
  AUTO_TEMPLATE_PREFIX,
  normalizeFixedSlotTimes,
  parseDateKeyToUtcStart,
  signatureHash,
  type BreakDto,
} from "@/lib/schedule/editor-shared";
import {
  WEEK_ANCHOR_MONDAY,
  type ScheduleModeValue,
  type SchedulePatternDto,
} from "@/lib/schedule/patterns-shared";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — ядро писателя графиков уровня транзакции.
 * Без `server-only` и без `@/lib/prisma`: его зовёт и рантайм
 * (`patterns.ts`), и пост-деплой (`tsx`, клиент БД параметром) — тот же
 * приём, что у `studios/portfolio-items-sync.ts`. Смысл и инварианты — в
 * шапке `patterns.ts`.
 */

type Db = Prisma.TransactionClient;

// ─── Шаблоны рабочих дней ────────────────────────────────────────────────────

export type DayTemplateDefinition = {
  startTime: string;
  endTime: string;
  breaks: BreakDto[];
  scheduleMode: ScheduleModeValue;
  fixedSlotTimes: string[];
};

/**
 * Подпись рабочего дня: одинаковые часы, перерывы и режим — один шаблон. Для
 * обычного дня подпись дословно прежняя (`editor.ts` до этапа 2), поэтому
 * созданные раньше шаблоны находятся по имени, а не дублируются.
 */
export function autoTemplateSignature(def: DayTemplateDefinition): string {
  const breaks =
    def.scheduleMode === "FIXED"
      ? []
      : def.breaks.map((entry) => ({ start: entry.start, end: entry.end, title: entry.title ?? null }));
  const base = `${def.startTime}|${def.endTime}|${JSON.stringify(breaks)}`;
  return def.scheduleMode === "FIXED"
    ? `${base}|FIXED|${normalizeFixedSlotTimes(def.fixedSlotTimes).join(",")}`
    : base;
}

/**
 * Цвет нового рабочего дня — `paletteColorPickerTx`. Без него день создаётся
 * без цвета и получает его при чтении (`assignPaletteColors`): так создаёт
 * перенос недель пост-деплоем.
 */
export type PickPaletteColor = () => Promise<ScheduleDayColorKey>;

/** Шаблон по подписи: найти или создать. Содержимое определяется подписью. */
export async function ensureAutoTemplateTx(
  tx: Db,
  providerId: string,
  def: DayTemplateDefinition,
  pickColor?: PickPaletteColor,
): Promise<string> {
  const name = `${AUTO_TEMPLATE_PREFIX}${signatureHash(autoTemplateSignature(def))}`;
  const existing = await tx.scheduleTemplate.findUnique({
    where: { providerId_name: { providerId, name } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const breaks = def.scheduleMode === "FIXED" ? [] : def.breaks;
  const created = await tx.scheduleTemplate.create({
    data: {
      providerId,
      name,
      startLocal: def.startTime,
      endLocal: def.endTime,
      color: pickColor ? await pickColor() : null,
      scheduleMode: def.scheduleMode,
      fixedSlotTimes: def.scheduleMode === "FIXED" ? normalizeFixedSlotTimes(def.fixedSlotTimes) : [],
      breaks: {
        create: breaks.map((entry, index) => ({
          startLocal: entry.start,
          endLocal: entry.end,
          sortOrder: index,
          title: entry.title ?? null,
        })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * SCHEDULE-BREAKS-MANY (2026-10-29) — рабочий день, НАЗВАННЫЙ окном графика
 * («Каждый раз по-разному» шлёт «Рабочий день»): новые часы заменяют прежние
 * на всех днях с `fromDateKey`.
 *
 * Найдено жалобой владельца: мастер поменял часы в окне, а записи шли по
 * старым. Окно создавало НОВЫЙ день палитры с тем же именем (правило «другие
 * часы — новый день», `ensurePaletteTemplateTx`), а отмеченные в календаре дни
 * ссылались на прежний — сохранённое в окне на запись не влияло, и в палитре
 * появлялось два «Рабочих дня».
 *
 * Правило «часы существующего дня не меняются» этим не нарушается: строка
 * прежнего дня не правится — дни с `fromDateKey` переходят на новую строку
 * (копия часов в строке «Особого дня» — тоже), прошедшие остаются на старой.
 * Прежняя версия теряет имя и уходит из палитры; когда на неё больше никто не
 * ссылается, её удаляет `deleteUnusedAutoTemplatesTx` после записи периода
 * (до неё на прежнюю версию ещё ссылается прежний график). Цвет — прежнего
 * дня, если запрос его не назвал: для человека это тот же «Рабочий день».
 */
export async function ensureNamedWizardDayTx(
  tx: Db,
  providerId: string,
  def: DayTemplateDefinition & { label: string; color: string | null },
  fromDateKey: string,
  pickColor?: PickPaletteColor,
): Promise<string> {
  const previous = await tx.scheduleTemplate.findMany({
    where: { providerId, label: def.label },
    select: { id: true, color: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const id = await ensurePaletteTemplateTx(
    tx,
    providerId,
    { ...def, color: def.color ?? previous.find((row) => row.color)?.color ?? null },
    pickColor,
  );
  const stale = previous.map((row) => row.id).filter((other) => other !== id);
  if (stale.length > 0) await replaceNamedDayVersionsTx(tx, providerId, id, stale, fromDateKey);
  return id;
}

/**
 * Дни календаря с `fromDateKey` на прежних версиях дня (`stale`) переходят на
 * `targetId` — вместе с копией часов в строке «Особого дня», по которой движок
 * их и считает; прежние версии теряют имя. Возвращает число переведённых дней.
 */
async function replaceNamedDayVersionsTx(
  tx: Db,
  providerId: string,
  targetId: string,
  stale: string[],
  fromDateKey: string,
): Promise<number> {
  const target = await tx.scheduleTemplate.findUniqueOrThrow({
    where: { id: targetId },
    select: { startLocal: true, endLocal: true, scheduleMode: true, fixedSlotTimes: true },
  });
  const moved = await tx.scheduleOverride.updateMany({
    where: {
      providerId,
      kind: "TEMPLATE",
      templateId: { in: stale },
      date: { gte: parseDateKeyToUtcStart(fromDateKey) },
    },
    data: {
      templateId: targetId,
      startLocal: target.startLocal,
      endLocal: target.endLocal,
      scheduleMode: target.scheduleMode,
      fixedSlotTimes: target.scheduleMode === "FIXED" ? target.fixedSlotTimes : [],
    },
  });
  await tx.scheduleTemplate.updateMany({ where: { id: { in: stale } }, data: { label: null } });
  return moved.count;
}

/**
 * Шаблоны редактора, на которые больше никто не ссылается — ни график (в том
 * числе прошлый), ни неделя, ни «Особый день». Шаблон, которому человек дал
 * имя в палитре (`label`, этап 3), — его выбор, а не побочный продукт
 * редактора: он не удаляется. День палитры без имени — прежняя версия
 * «Рабочего дня» окна графика, которую заменила новая
 * (`ensureNamedWizardDayTx`, SCHEDULE-BREAKS-MANY): удаляется так же.
 */
export async function deleteUnusedAutoTemplatesTx(tx: Db, providerId: string): Promise<void> {
  await tx.scheduleTemplate.deleteMany({
    where: {
      providerId,
      OR: [{ name: { startsWith: AUTO_TEMPLATE_PREFIX } }, { name: { startsWith: PALETTE_TEMPLATE_PREFIX } }],
      label: null,
      patternDays: { none: {} },
      weeklyScheduleDays: { none: {} },
      scheduleOverrides: { none: {} },
    },
  });
}

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — рабочий день палитры с именем («Утро»,
 * «Полный день»). В отличие от шаблона редактора (подпись содержимого в имени,
 * удаляется, когда на него никто не ссылается) это выбор человека: живёт, пока
 * его не удалят, и один и тот же набор часов может быть в палитре дважды под
 * разными именами. `name` — технический ключ (уникален у провайдера), имя для
 * человека — `label`.
 */
export const PALETTE_TEMPLATE_PREFIX = "__palette_";

type TemplateRowForSignature = {
  startLocal: string;
  endLocal: string;
  scheduleMode: ScheduleModeValue;
  fixedSlotTimes: string[];
  breaks: Array<{ startLocal: string; endLocal: string; sortOrder: number; title: string | null }>;
};

export function templateRowDefinition(row: TemplateRowForSignature): DayTemplateDefinition {
  return {
    startTime: row.startLocal,
    endTime: row.endLocal,
    scheduleMode: row.scheduleMode,
    fixedSlotTimes: row.fixedSlotTimes,
    breaks: row.breaks
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((entry) => ({ start: entry.startLocal, end: entry.endLocal, title: entry.title ?? null })),
  };
}

/**
 * Рабочий день палитры: тот же, если с таким именем и таким содержимым уже
 * есть, иначе новый. Повторное применение пошагового окна поэтому не плодит
 * дубли «Рабочего дня».
 */
export async function ensurePaletteTemplateTx(
  tx: Db,
  providerId: string,
  def: DayTemplateDefinition & { label: string; color: string | null },
  pickColor?: PickPaletteColor,
): Promise<string> {
  const signature = autoTemplateSignature(def);
  const sameLabel = await tx.scheduleTemplate.findMany({
    where: { providerId, label: def.label },
    select: {
      id: true,
      startLocal: true,
      endLocal: true,
      scheduleMode: true,
      fixedSlotTimes: true,
      breaks: { select: { startLocal: true, endLocal: true, sortOrder: true, title: true } },
    },
  });
  const existing = sameLabel.find((row) => autoTemplateSignature(templateRowDefinition(row)) === signature);
  if (existing) return existing.id;

  const breaks = def.scheduleMode === "FIXED" ? [] : def.breaks;
  const created = await tx.scheduleTemplate.create({
    data: {
      providerId,
      name: `${PALETTE_TEMPLATE_PREFIX}${randomUUID()}`,
      label: def.label,
      color: def.color ?? (pickColor ? await pickColor() : null),
      startLocal: def.startTime,
      endLocal: def.endTime,
      scheduleMode: def.scheduleMode,
      fixedSlotTimes: def.scheduleMode === "FIXED" ? normalizeFixedSlotTimes(def.fixedSlotTimes) : [],
      breaks: {
        create: breaks.map((entry, index) => ({
          startLocal: entry.start,
          endLocal: entry.end,
          sortOrder: index,
          title: entry.title ?? null,
        })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

// ─── Палитра и цвета ─────────────────────────────────────────────────────────

/**
 * Счётчики шаблона, из которых выводится «в палитре» / «используется». Один
 * select на чтение кабинета (`loadSchedulePlan`) и выбор цвета нового дня.
 */
export function paletteTemplateCountsSelect(todayKey: string) {
  return {
    select: {
      // include-ok: счётчики, а не выборка строк.
      patternDays: true,
      // include-ok: счётчик, а не выборка строк.
      weeklyScheduleDays: true,
      // «Особый день» в прошлом держит свою копию часов (`SetNull` при
      // удалении шаблона), будущий — нет: он и есть расписание.
      scheduleOverrides: { where: { date: { gte: parseDateKeyToUtcStart(todayKey) } } },
    },
  } as const;
}

export type PaletteTemplateCounts = {
  patternDays: number;
  weeklyScheduleDays: number;
  scheduleOverrides: number;
};

/**
 * Рабочий день в палитре: у него имя от человека, на него ссылается график,
 * не кончившийся до сегодня, или будущий «Особый день», либо (у профиля без
 * графика, `legacy`) рабочий день недели. «Используется» — на него ссылается
 * хоть что-то: удалить его нельзя.
 */
export function paletteMembership(
  template: { id: string; label: string | null; _count: PaletteTemplateCounts },
  context: { scheduledIds: ReadonlySet<string>; legacy: boolean },
): { inUse: boolean; inPalette: boolean } {
  const counts = template._count;
  const inUse = counts.patternDays > 0 || counts.weeklyScheduleDays > 0 || counts.scheduleOverrides > 0;
  const inPalette =
    template.label !== null ||
    context.scheduledIds.has(template.id) ||
    counts.scheduleOverrides > 0 ||
    (context.legacy && counts.weeklyScheduleDays > 0);
  return { inUse, inPalette };
}

/** Цвета дней палитры профиля на сегодня — те же, что видит кабинет. */
async function loadPaletteColorsTx(tx: Db, providerId: string, todayKey: string): Promise<ScheduleDayColorKey[]> {
  const periods = await tx.schedulePattern.findMany({
    where: { providerId, OR: [{ endsOn: null }, { endsOn: { gte: todayKey } }] },
    // include-ok: позиции одного периода — не больше длины цикла.
    select: { days: { select: { templateId: true } } },
  });
  const totalPatterns =
    periods.length > 0 ? periods.length : await tx.schedulePattern.count({ where: { providerId } });
  const hasLegacyWeek =
    totalPatterns === 0
      ? await tx.weeklyScheduleConfig.count({
          where: { providerId, days: { some: { isActive: true, templateId: { not: null } } } },
        })
      : 0;
  const templates = await tx.scheduleTemplate.findMany({
    where: { providerId },
    select: { id: true, label: true, color: true, _count: paletteTemplateCountsSelect(todayKey) },
    orderBy: { createdAt: "asc" },
  });

  const scheduledIds = new Set(
    periods.flatMap((period) => period.days.map((day) => day.templateId)).filter((id): id is string => id !== null),
  );
  const legacy = totalPatterns === 0 && hasLegacyWeek > 0;
  const rows = templates.map((template) => ({
    color: template.color,
    inPalette: paletteMembership(template, { scheduledIds, legacy }).inPalette,
  }));
  const colors = assignPaletteColors(rows);
  return colors.filter((_, index) => rows[index]!.inPalette);
}

/**
 * Выдача цветов новым рабочим дням одной транзакции: занятые цвета палитры
 * читаются один раз — при первом создании (найденный по подписи день цвет не
 * запрашивает), — а каждый выданный тут же считается занятым, поэтому два дня
 * одного окна графика («разные часы по дням») не получат один цвет.
 */
export function paletteColorPickerTx(tx: Db, providerId: string, todayKey: string): PickPaletteColor {
  let taken: ScheduleDayColorKey[] | null = null;
  return async () => {
    taken ??= await loadPaletteColorsTx(tx, providerId, todayKey);
    const color = nextPaletteColor(taken);
    taken.push(color);
    return color;
  };
}

// ─── Периоды ─────────────────────────────────────────────────────────────────

export async function createPeriodTx(tx: Db, providerId: string, period: SchedulePatternDto): Promise<void> {
  await tx.schedulePattern.create({
    data: {
      providerId,
      kind: period.kind,
      cycleDays: period.cycleDays,
      anchorOn: period.anchorOn,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      days: {
        createMany: {
          data: period.days.map((templateId, position) => ({ position, templateId })),
        },
      },
    },
    select: { id: true },
  });
}

/**
 * Неделя профиля без графика → период «с начала времён, продлевается
 * автоматически». Идемпотентно: у профиля с графиком ничего не делает.
 * Режим записи у старой недели — на строке дня; у графика он на шаблоне,
 * поэтому фиксированные дни получают свои шаблоны.
 */
export async function ensurePatternHistoryTx(tx: Db, providerId: string): Promise<boolean> {
  const count = await tx.schedulePattern.count({ where: { providerId } });
  if (count > 0) return false;

  const config = await tx.weeklyScheduleConfig.findUnique({
    where: { providerId },
    select: {
      days: {
        select: {
          weekday: true,
          isActive: true,
          templateId: true,
          scheduleMode: true,
          fixedSlotTimes: true,
          template: { select: { startLocal: true, endLocal: true } },
        },
      },
    },
  });
  if (!config || config.days.length === 0) return false;

  const days: Array<string | null> = Array.from({ length: 7 }, () => null);
  for (const day of config.days) {
    const position = day.weekday - 1; // 1 = Пн … 7 = Вс
    if (position < 0 || position > 6 || !day.isActive || !day.templateId || !day.template) continue;
    if (day.scheduleMode === "FIXED") {
      days[position] = await ensureAutoTemplateTx(tx, providerId, {
        startTime: day.template.startLocal,
        endTime: day.template.endLocal,
        breaks: [],
        scheduleMode: "FIXED",
        fixedSlotTimes: day.fixedSlotTimes,
      });
    } else {
      days[position] = day.templateId;
    }
  }

  await createPeriodTx(tx, providerId, {
    kind: "WEEK",
    cycleDays: 7,
    anchorOn: WEEK_ANCHOR_MONDAY,
    startsOn: null,
    endsOn: null,
    days,
  });
  return true;
}

// ─── Перенос недель в графики (пост-деплой, сиды) ────────────────────────────

/**
 * Каждой неделе `WeeklyScheduleConfig` без графика — период «с начала времён,
 * продлевается автоматически» (решение владельца: у действующих мастеров
 * ничего не меняется). Идемпотентно: у профиля с графиком ничего не делает.
 * Сбой одного профиля остальных не останавливает — до переноса движок читает
 * его неделю по-старому, а следующий запуск подхватит его снова.
 */
export async function backfillWeeklySchedulePatterns(
  client: PrismaClient,
): Promise<{ converted: number; failed: Array<{ providerId: string; error: string }> }> {
  const candidates = await client.weeklyScheduleConfig.findMany({
    where: { provider: { schedulePatterns: { none: {} } } },
    select: { providerId: true },
  });
  let converted = 0;
  const failed: Array<{ providerId: string; error: string }> = [];
  for (const { providerId } of candidates) {
    try {
      const done = await client.$transaction((tx) => ensurePatternHistoryTx(tx, providerId));
      if (done) converted += 1;
    } catch (error) {
      failed.push({ providerId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { converted, failed };
}

// ─── «Рабочий день» окна графика: починка прежних данных (пост-деплой) ────────

/** Период окна графика пишется той же транзакцией, что новая версия дня. */
const SAME_WRITE_WINDOW_MS = 60_000;

export type NamedWizardDaysRepair = {
  repaired: number;
  movedDays: number;
  failed: Array<{ providerId: string; error: string }>;
};

/**
 * SCHEDULE-BREAKS-MANY (2026-10-29) — данные, оставленные до
 * `ensureNamedWizardDayTx`: повторное «Каждый раз по-разному» с другими часами
 * создавало ВТОРОЙ рабочий день с тем же именем, а отмеченные в календаре дни
 * оставались на первом — записи шли по старым часам (жалоба владельца). Здесь
 * тот же перевод, что окно делает теперь: новейшая версия — текущая (её же
 * открывает окно, `initial-draft.ts`), дни с начала её графика переходят на
 * неё, прежние версии теряют имя и удаляются, когда на них никто не ссылается.
 *
 * Начало графика — период, записанный вместе с новейшей версией (в ручном
 * режиме период дня не содержит, связи по ссылке нет), но не раньше сегодня
 * салона: прошедшие дни остаются с часами, по которым работали.
 *
 * Идемпотентно: после прохода у профиля одна версия с этим именем, и второй
 * запуск его не находит. Сбой одного профиля остальных не останавливает.
 */
export async function repairNamedWizardDays(
  client: PrismaClient,
  label: string,
  now: Date = new Date(),
): Promise<NamedWizardDaysRepair> {
  const rows = await client.scheduleTemplate.findMany({ where: { label }, select: { providerId: true } });
  const versions = new Map<string, number>();
  for (const row of rows) versions.set(row.providerId, (versions.get(row.providerId) ?? 0) + 1);

  const result: NamedWizardDaysRepair = { repaired: 0, movedDays: 0, failed: [] };
  for (const [providerId, count] of versions) {
    if (count < 2) continue;
    try {
      result.movedDays += await client.$transaction(async (tx) => {
        const [current, ...stale] = await tx.scheduleTemplate.findMany({
          where: { providerId, label },
          select: { id: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (!current || stale.length === 0) return 0;

        const provider = await tx.provider.findUniqueOrThrow({
          where: { id: providerId },
          select: { timezone: true },
        });
        const todayKey = toLocalDateKey(now, provider.timezone);
        const period = await tx.schedulePattern.findFirst({
          where: {
            providerId,
            createdAt: {
              gte: new Date(current.createdAt.getTime() - SAME_WRITE_WINDOW_MS),
              lte: new Date(current.createdAt.getTime() + SAME_WRITE_WINDOW_MS),
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { startsOn: true },
        });
        const fromDateKey = period?.startsOn && period.startsOn > todayKey ? period.startsOn : todayKey;

        const moved = await replaceNamedDayVersionsTx(
          tx,
          providerId,
          current.id,
          stale.map((row) => row.id),
          fromDateKey,
        );
        await deleteUnusedAutoTemplatesTx(tx, providerId);
        return moved;
      });
      result.repaired += 1;
    } catch (error) {
      result.failed.push({ providerId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

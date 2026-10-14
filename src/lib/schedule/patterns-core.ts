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

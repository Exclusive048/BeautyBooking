import "server-only"; // GUARDRAILS-01: documented server boundary (client-safe helpers live in editor-shared.ts)
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import {
  normalizeBufferMin,
  normalizeExceptionInput,
  normalizeFixedSlotTimes,
  normalizeSlotStepMin,
  normalizeWeekScheduleInput,
  parseDateKeyToUtcStart,
  WEEK_TEMPLATE_OPTIONS,
  type BookingRulesDto,
  type BreakDto,
  type DayScheduleDto,
  type EditorExceptionInput,
  type HotSlotApplyMode,
  type HotSlotsDto,
  type LateCancelAction,
  type ScheduleEditorSnapshot,
  type ScheduleExceptionDto,
  type SlotPrecision,
  type VisibilityDto,
} from "@/lib/schedule/editor-shared";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { loadSchedulePlan, readWeekRepresentation, saveWeekAsPatternTx } from "@/lib/schedule/patterns";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * Server-only orchestration for schedule edits. The pure types/helpers
 * live in `./editor-shared` (client-safe); this module adds the Prisma
 * reads/writes and Redis cache invalidation. Anything that runs in a
 * client bundle MUST import from `./editor-shared` instead — otherwise
 * the import chain drags `@redis/client` (Node `net`) into the browser
 * build. See [editor-shared.ts](./editor-shared.ts) header for context.
 *
 * For backwards compatibility every public symbol from `editor-shared`
 * is re-exported below so existing server callers (API routes, legacy
 * studio editor) keep their `import { ... } from "@/lib/schedule/editor"`
 * paths working unchanged.
 */
export * from "@/lib/schedule/editor-shared";

// Private to the snapshot builder — kept local since they're tiny.
const LATE_CANCEL_ACTIONS: readonly LateCancelAction[] = ["none", "reminder", "fine"];
const SLOT_PRECISIONS: readonly SlotPrecision[] = ["exact", "today_free", "date_only"];

/**
 * SCHEDULE-PATTERNS-01 (этап 2): неделя (`weekSchedule` в PATCH) пишется ГРАФИКОМ
 * (`patterns.ts`): с сегодняшнего дня действует новая неделя, прошлые дни
 * остаются с прежней. Неизменённая неделя не пишется вовсе — снапшот шлёт её
 * при сохранении любой вкладки. Вкладки «Часы» нет с SCHEDULE-HOURS-TAB-REMOVAL
 * (2026-10-01): интерфейс неделю больше не меняет, неделю задаёт окно графика.
 * `WeeklyScheduleConfig` больше не пишется: у профиля с графиком это история
 * до переноса.
 */
async function saveWeekSchedule(
  tx: Prisma.TransactionClient,
  providerId: string,
  weekSchedule: DayScheduleDto[]
): Promise<void> {
  await saveWeekAsPatternTx(tx, providerId, weekSchedule);
}

/** «Особый день»: свои часы (или выходной) на дату. Экспорт — для календаря (этап 3). */
export async function saveScheduleExceptionTx(
  tx: Prisma.TransactionClient,
  providerId: string,
  input: EditorExceptionInput,
): Promise<void> {
  const date = parseDateKeyToUtcStart(input.date);
  const fields = {
    kind: input.isWorkday ? ("TIME_RANGE" as const) : ("OFF" as const),
    isDayOff: !input.isWorkday,
    isWorkday: input.isWorkday,
    startLocal: input.isWorkday ? input.startTime : null,
    endLocal: input.isWorkday ? input.endTime : null,
    templateId: null,
    isActive: null,
    scheduleMode: input.scheduleMode,
    fixedSlotTimes: input.scheduleMode === "FIXED" ? input.fixedSlotTimes : [],
    note: input.note,
  };

  // SCHEDULE-PATTERNS-01: строка на дату одна (`@@unique([providerId, date])`),
  // поэтому правка — upsert по этому ключу, а не «найти, потом создать».
  await tx.scheduleOverride.upsert({
    where: { providerId_date: { providerId, date } },
    update: fields,
    create: { providerId, date, ...fields },
  });

  await tx.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } });
  if (input.isWorkday && input.scheduleMode === "FLEXIBLE" && input.breaks.length > 0) {
    await tx.scheduleBreak.createMany({
      data: input.breaks.map((item) => ({
        providerId,
        kind: "OVERRIDE",
        date,
        startLocal: item.start,
        endLocal: item.end,
      })),
    });
  }
}

/** Снять правку даты: день снова идёт по графику. */
export async function removeScheduleExceptionTx(
  tx: Prisma.TransactionClient,
  providerId: string,
  dateKey: string,
): Promise<void> {
  const date = parseDateKeyToUtcStart(dateKey);
  await tx.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } });
  await tx.scheduleOverride.deleteMany({ where: { providerId, date } });
}

/**
 * «Особые дни» так, как их видит редактор. Одна функция на чтение снапшота и
 * на сравнение при записи (`applyScheduleSnapshotTx`): запись сравнивает
 * присланное именно с этим видом, поэтому неизменённый день не переписывается.
 *
 * День, покрашенный в календаре рабочим днём палитры (`TEMPLATE`, этап 3),
 * показывается часами, перерывами и режимом шаблона — режим записи с этапа 2
 * живёт на шаблоне, а не на строке исключения.
 */
export async function readScheduleExceptionsTx(
  db: Prisma.TransactionClient,
  providerId: string,
  timezone: string,
): Promise<ScheduleExceptionDto[]> {
  const [overrides, overrideBreaks] = await Promise.all([
    db.scheduleOverride.findMany({
      where: { providerId },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        kind: true,
        isDayOff: true,
        isWorkday: true,
        startLocal: true,
        endLocal: true,
        scheduleMode: true,
        fixedSlotTimes: true,
        note: true,
        template: {
          select: {
            startLocal: true,
            endLocal: true,
            scheduleMode: true,
            fixedSlotTimes: true,
            breaks: {
              select: { startLocal: true, endLocal: true, sortOrder: true, title: true },
            },
          },
        },
      },
    }),
    db.scheduleBreak.findMany({
      where: { providerId, kind: "OVERRIDE", date: { not: null } },
      select: { date: true, startLocal: true, endLocal: true },
      orderBy: [{ date: "asc" }, { startLocal: "asc" }],
    }),
  ]);

  const overrideBreaksByDate = new Map<string, BreakDto[]>();
  for (const row of overrideBreaks) {
    if (!row.date) continue;
    const key = toLocalDateKey(row.date, timezone);
    const list = overrideBreaksByDate.get(key) ?? [];
    list.push({ start: row.startLocal, end: row.endLocal, title: null });
    overrideBreaksByDate.set(key, list);
  }

  return overrides.map((row) => {
    const dateKey = toLocalDateKey(row.date, timezone);
    const isWorkday = row.isWorkday ?? !row.isDayOff;
    const template = row.kind === "TEMPLATE" ? row.template : null;
    const fixedSlotTimes = normalizeFixedSlotTimes(
      template && template.scheduleMode === "FIXED" ? template.fixedSlotTimes : row.fixedSlotTimes,
    );
    const scheduleMode = template
      ? template.scheduleMode
      : row.scheduleMode ?? (fixedSlotTimes.length > 0 ? "FIXED" : "FLEXIBLE");
    const templateBreaks =
      row.template?.breaks
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
          start: item.startLocal,
          end: item.endLocal,
          title: item.title ?? null,
        })) ?? [];
    const breaks = row.kind === "TEMPLATE" ? templateBreaks : overrideBreaksByDate.get(dateKey) ?? [];

    return {
      id: row.id,
      note: row.note ?? null,
      date: dateKey,
      isWorkday,
      scheduleMode,
      startTime: row.kind === "TEMPLATE" ? row.template?.startLocal ?? null : row.startLocal,
      endTime: row.kind === "TEMPLATE" ? row.template?.endLocal ?? null : row.endLocal,
      breaks: isWorkday && scheduleMode === "FLEXIBLE" ? breaks : [],
      fixedSlotTimes,
    };
  });
}

export async function buildScheduleSnapshot(providerId: string): Promise<ScheduleEditorSnapshot> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      timezone: true,
      slotStepMin: true,
      autoConfirmBookings: true,
      cancellationDeadlineHours: true,
      minBookingHoursAhead: true,
      maxBookingDaysAhead: true,
      lateCancelAction: true,
      slotPrecision: true,
      visibleSlotDays: true,
      acceptNewClients: true,
      isPublished: true,
      bufferBetweenBookingsMin: true,
    },
  });
  if (!provider) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  const discountRule = await prisma.discountRule.findUnique({
    where: { providerId },
    select: {
      isEnabled: true,
      triggerHours: true,
      discountType: true,
      discountValue: true,
      applyMode: true,
    },
  });

  const todayKey = toLocalDateKey(new Date(), provider.timezone);
  const [{ week: weekSchedule }, schedulePlan, exceptions] = await Promise.all([
    // SCHEDULE-PATTERNS-01: неделя «Часов» — из графика, действующего сегодня.
    readWeekRepresentation(prisma, providerId, todayKey),
    loadSchedulePlan(providerId),
    readScheduleExceptionsTx(prisma, providerId, provider.timezone),
  ]);

  const lateCancelAction: LateCancelAction = LATE_CANCEL_ACTIONS.includes(
    provider.lateCancelAction as LateCancelAction
  )
    ? (provider.lateCancelAction as LateCancelAction)
    : "none";

  const slotPrecision: SlotPrecision = SLOT_PRECISIONS.includes(
    provider.slotPrecision as SlotPrecision
  )
    ? (provider.slotPrecision as SlotPrecision)
    : "exact";

  const bookingRules: BookingRulesDto = {
    minHoursAhead: provider.minBookingHoursAhead,
    maxDaysAhead: provider.maxBookingDaysAhead,
    autoConfirm: provider.autoConfirmBookings,
    freeCancelHours: provider.cancellationDeadlineHours ?? null,
    lateCancelAction,
  };

  const visibility: VisibilityDto = {
    isPublished: provider.isPublished,
    slotPrecision,
    visibleSlotDays: provider.visibleSlotDays,
    acceptNewClients: provider.acceptNewClients,
  };

  const hotSlots: HotSlotsDto | null =
    discountRule && discountRule.isEnabled
      ? {
          triggerHours: discountRule.triggerHours,
          discountValue: discountRule.discountValue,
          applyMode: discountRule.applyMode as HotSlotApplyMode,
        }
      : null;

  return {
    timezone: provider.timezone,
    slotStepMin: normalizeSlotStepMin(provider.slotStepMin),
    bufferBetweenBookingsMin: normalizeBufferMin(provider.bufferBetweenBookingsMin),
    weekSchedule,
    schedulePlan,
    exceptions,
    templates: WEEK_TEMPLATE_OPTIONS,
    bookingRules,
    visibility,
    hotSlots,
  };
}

/**
 * Writes Provider settings + DiscountRule for hot slots.
 *
 * LOGIC-12: собственная транзакция снята — функция теперь работает на `tx`
 * внешней. Атомарность не ослабла, а расширилась: раньше настройки и правило
 * скидок применялись атомарно ОТДЕЛЬНО от расписания, то есть обрыв между
 * двумя транзакциями оставлял применённой половину снапшота.
 *
 * Hot-slot semantics: input.hotSlots === null → toggle off (DiscountRule
 * stays in DB but `isEnabled = false`, preserving previous tuning).
 * input.hotSlots = object → toggle on + write values; preserves the
 * detailed page's `minPriceFrom` / `serviceIds` if a row already exists.
 */
async function applyProviderAndDiscountRule(
  tx: Prisma.TransactionClient,
  providerId: string,
  input: {
    slotStepMin?: number;
    bufferBetweenBookingsMin?: number;
    bookingRules?: BookingRulesDto;
    visibility?: VisibilityDto;
    hotSlots?: HotSlotsDto | null;
  }
): Promise<void> {
  const providerData: Prisma.ProviderUpdateInput = {};
  if (input.slotStepMin !== undefined) {
    providerData.slotStepMin = normalizeSlotStepMin(input.slotStepMin);
  }
  if (input.bufferBetweenBookingsMin !== undefined) {
    providerData.bufferBetweenBookingsMin = normalizeBufferMin(input.bufferBetweenBookingsMin);
  }
  if (input.bookingRules) {
    const rules = input.bookingRules;
    providerData.minBookingHoursAhead = rules.minHoursAhead;
    providerData.maxBookingDaysAhead = rules.maxDaysAhead;
    providerData.autoConfirmBookings = rules.autoConfirm;
    providerData.cancellationDeadlineHours = rules.freeCancelHours;
    providerData.lateCancelAction = rules.lateCancelAction;
  }
  if (input.visibility) {
    providerData.isPublished = input.visibility.isPublished;
    providerData.slotPrecision = input.visibility.slotPrecision;
    providerData.visibleSlotDays = input.visibility.visibleSlotDays;
    providerData.acceptNewClients = input.visibility.acceptNewClients;
  }

  const hasProviderUpdate = Object.keys(providerData).length > 0;
  const hasHotSlotInput = input.hotSlots !== undefined;

  if (!hasProviderUpdate && !hasHotSlotInput) return;

  if (hasProviderUpdate) {
    await tx.provider.update({ where: { id: providerId }, data: providerData });
  }

  if (input.hotSlots === undefined) return;
  const rule = input.hotSlots;

  if (rule === null) {
    const existing = await tx.discountRule.findUnique({ where: { providerId } });
    if (existing && existing.isEnabled) {
      await tx.discountRule.update({
        where: { providerId },
        data: { isEnabled: false },
      });
    }
    return;
  }

  await tx.discountRule.upsert({
    where: { providerId },
    create: {
      providerId,
      isEnabled: true,
      smartPriceEnabled: false,
      triggerHours: rule.triggerHours,
      discountType: "PERCENT",
      discountValue: rule.discountValue,
      applyMode: rule.applyMode,
      minPriceFrom: null,
      serviceIds: [],
    },
    update: {
      isEnabled: true,
      triggerHours: rule.triggerHours,
      discountValue: rule.discountValue,
      applyMode: rule.applyMode,
      // discountType / smartPriceEnabled / minPriceFrom / serviceIds are
      // preserved — the detailed hot-slots page owns those.
    },
  });
}

export type ScheduleSnapshotInput = {
  weekSchedule: DayScheduleDto[];
  /**
   * Полный список «Особых дней». Не передан — правки дат не трогаются
   * (календарь пишет их сам, `calendar.ts`).
   */
  exceptions?: Array<Omit<ScheduleExceptionDto, "id">>;
  slotStepMin?: number;
  bufferBetweenBookingsMin?: number;
  bookingRules?: BookingRulesDto;
  visibility?: VisibilityDto;
  /** Pass `null` to disable, an object to enable + write values. Omit to leave alone. */
  hotSlots?: HotSlotsDto | null;
};

/**
 * Бюджет транзакции снапшота. Поднят над дефолтными 5 с осознанно: внутри цикл
 * upsert'ов шаблонов и цикл исключений, число которых задаёт пользователь.
 * Экспортируется, потому что вызывающий, который добавляет к снапшоту свои
 * записи в той же транзакции (LOGIC-13), обязан взять тот же бюджет.
 */
export const SCHEDULE_SNAPSHOT_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

function exceptionSignature(input: Omit<ScheduleExceptionDto, "id">): string {
  return JSON.stringify(normalizeExceptionInput(input));
}

/**
 * Применение снапшота внутри ЧУЖОЙ транзакции. Инвалидацию кэша НЕ делает —
 * её обязан сделать вызывающий после коммита (до коммита сбрасывать нечего, а
 * откат оставил бы кэш вычищенным под старые данные).
 *
 * SCHEDULE-PATTERNS-01 (этап 3): «Особые дни» пишутся РАЗНИЦЕЙ. Раньше каждое
 * сохранение любой вкладки переписывало все исключения заново — а день,
 * покрашенный в календаре рабочим днём палитры (`TEMPLATE`), при такой
 * перезаписи терял связь с шаблоном и становился копией его часов (режим
 * «Фиксированное время» при этом терялся вовсе). Теперь пишется только дата,
 * чей вид изменился, и удаляется только дата, которой в списке больше нет.
 */
export async function applyScheduleSnapshotTx(
  tx: Prisma.TransactionClient,
  providerId: string,
  input: ScheduleSnapshotInput
): Promise<void> {
  const weekSchedule = normalizeWeekScheduleInput(input.weekSchedule as unknown);

  await applyProviderAndDiscountRule(tx, providerId, input);

  await saveWeekSchedule(tx, providerId, weekSchedule);

  if (!input.exceptions) return;

  const provider = await tx.provider.findUnique({ where: { id: providerId }, select: { timezone: true } });
  if (!provider) throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  const current = await readScheduleExceptionsTx(tx, providerId, provider.timezone);
  const currentByDate = new Map(current.map((item) => [item.date, exceptionSignature(item)]));

  const nextDateKeys = new Set<string>();
  for (const raw of input.exceptions) {
    const item = normalizeExceptionInput(raw);
    nextDateKeys.add(item.date);
    if (currentByDate.get(item.date) === JSON.stringify(item)) continue;
    await saveScheduleExceptionTx(tx, providerId, item);
  }

  for (const dateKey of currentByDate.keys()) {
    if (!nextDateKeys.has(dateKey)) {
      await removeScheduleExceptionTx(tx, providerId, dateKey);
    }
  }
}

/**
 * FIX-STUDIO-POLICY-EDITABLE — узкий writer правил записи провайдера.
 *
 * Зачем отдельная функция, а не `applyScheduleSnapshot`: снапшот требует ПОЛНОЕ
 * недельное расписание и список исключений, потому что применяет их через
 * `deleteMany` + `createMany`. У студии этого расписания нет вовсе — рабочие
 * часы живут у мастеров, — то есть отправить снапшот означало бы стереть
 * структуру, которой у провайдера-студии и не должно быть. Отсюда и симптом, с
 * которого началась правка: правила студии редактировались только через экран
 * расписания МАСТЕРА, и без единого мастера менять их было негде.
 *
 * Почему писать здесь, а не прямым Prisma-вызовом из роута (CLAUDE.md rule 5):
 * `minBookingHoursAhead` / `maxBookingDaysAhead` / `acceptNewClients` — входы
 * выдачи слотов, и место их записи обязано совпадать с местом инвалидации.
 *
 * ⚠️ Инвалидация здесь — СТРАХОВКА, а не необходимость: эти три поля
 * применяются ПОСЛЕ чтения кэша (они сужают выдачу, а не то, что закэшировано —
 * PERF-18), и в `scheduleVersion` намеренно не входят. Дешевле сбросить, чем
 * держать в голове, какое из полей на какой стороне кэша.
 */
export type ProviderBookingPolicyInput = {
  minHoursAhead: number;
  maxDaysAhead: number;
  freeCancelHours: number | null;
  lateCancelAction: LateCancelAction;
  acceptNewClients: boolean;
  remindersEnabled: boolean;
};

export async function applyProviderBookingPolicy(
  providerId: string,
  input: ProviderBookingPolicyInput
): Promise<void> {
  const lateCancelAction: LateCancelAction = LATE_CANCEL_ACTIONS.includes(input.lateCancelAction)
    ? input.lateCancelAction
    : "none";

  await prisma.provider.update({
    where: { id: providerId },
    data: {
      minBookingHoursAhead: input.minHoursAhead,
      maxBookingDaysAhead: input.maxDaysAhead,
      cancellationDeadlineHours: input.freeCancelHours,
      lateCancelAction,
      acceptNewClients: input.acceptNewClients,
      remindersEnabled: input.remindersEnabled,
    },
    select: { id: true },
  });

  await invalidateSlotsForMaster(providerId);
}

export async function applyScheduleSnapshot(
  providerId: string,
  input: ScheduleSnapshotInput
): Promise<void> {
  // LOGIC-12: весь снапшот применяется ОДНОЙ транзакцией.
  //
  // Раньше это были четыре независимых шага, и самый чувствительный —
  // `saveWeekSchedule` — внутри себя делает `deleteMany` + `createMany`. Обрыв
  // между ними (таймаут пула, рестарт пода, сетевой сбой) оставлял мастера с
  // НУЛЁМ `WeeklyScheduleDay`, а `buildWeeklyRule` при отсутствии рабочих дней
  // возвращает `null` — то есть мастер молча исчезал из выдачи слотов и
  // переставал принимать записи. В UI это выглядело как «просто не
  // сохранилось»: PATCH ведь вернул ошибку. Соседняя
  // `applyProviderAndDiscountRule` в этом же файле транзакцию имела, с
  // комментарием «so a half-applied state is impossible», — расписание её не
  // имело.
  await prisma.$transaction(
    (tx: Prisma.TransactionClient) => applyScheduleSnapshotTx(tx, providerId, input),
    SCHEDULE_SNAPSHOT_TX_OPTIONS,
  );

  // Инвалидация — ПОСЛЕ коммита: до него кэш сбрасывать не на что, а откат
  // транзакции оставил бы кэш вычищенным под старые данные.
  await invalidateSlotsForMaster(providerId);
}

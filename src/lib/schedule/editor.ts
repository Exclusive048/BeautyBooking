import { ScheduleMode, type Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import {
  AUTO_TEMPLATE_PREFIX,
  buildDefaultWeekSchedule,
  mapTemplateForDay,
  normalizeBufferMin,
  normalizeExceptionInput,
  normalizeFixedSlotTimes,
  normalizeSlotStepMin,
  normalizeWeekScheduleInput,
  parseDateKeyToUtcStart,
  signatureHash,
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

async function saveWeekSchedule(
  providerId: string,
  weekSchedule: DayScheduleDto[]
): Promise<void> {
  const config = await prisma.weeklyScheduleConfig.upsert({
    where: { providerId },
    update: {},
    create: { providerId },
    select: { id: true },
  });

  const signatures = new Map<
    string,
    { name: string; startLocal: string; endLocal: string; breaks: BreakDto[] }
  >();
  const signatureOrder: string[] = [];
  for (const day of weekSchedule) {
    if (!day.isWorkday) continue;
    const mapped = mapTemplateForDay(day);
    // Title is part of the signature so two days with the same time but
    // different break titles ("Обед" vs "Перерыв") get distinct templates
    // — matches user intent of distinguishing recurring breaks by label.
    const signatureBreaks = mapped.breaks.map((entry) => ({
      start: entry.start,
      end: entry.end,
      title: entry.title ?? null,
    }));
    const signature = `${mapped.startLocal}|${mapped.endLocal}|${JSON.stringify(signatureBreaks)}`;
    if (signatures.has(signature)) continue;
    signatures.set(signature, {
      name: `${AUTO_TEMPLATE_PREFIX}${signatureHash(signature)}`,
      startLocal: mapped.startLocal,
      endLocal: mapped.endLocal,
      breaks: mapped.breaks,
    });
    signatureOrder.push(signature);
  }

  const templateIdBySignature = new Map<string, string>();
  for (const signature of signatureOrder) {
    const item = signatures.get(signature);
    if (!item) continue;
    const template = await prisma.scheduleTemplate.upsert({
      where: { providerId_name: { providerId, name: item.name } },
      update: { startLocal: item.startLocal, endLocal: item.endLocal, color: null },
      create: {
        providerId,
        name: item.name,
        startLocal: item.startLocal,
        endLocal: item.endLocal,
        color: null,
      },
      select: { id: true },
    });
    templateIdBySignature.set(signature, template.id);
    await prisma.scheduleTemplateBreak.deleteMany({ where: { templateId: template.id } });
    if (item.breaks.length > 0) {
      await prisma.scheduleTemplateBreak.createMany({
        data: item.breaks.map((entry, index) => ({
          templateId: template.id,
          startLocal: entry.start,
          endLocal: entry.end,
          sortOrder: index,
          title: entry.title ?? null,
        })),
      });
    }
  }

  const rows: Array<{
    configId: string;
    weekday: number;
    templateId: string | null;
    isActive: boolean;
    scheduleMode: ScheduleMode;
    fixedSlotTimes: string[];
  }> = weekSchedule.map((day) => {
    if (!day.isWorkday) {
      return {
        configId: config.id,
        weekday: day.dayOfWeek + 1,
        templateId: null,
        isActive: false,
        scheduleMode: day.scheduleMode,
        fixedSlotTimes: day.fixedSlotTimes,
      };
    }
    const mapped = mapTemplateForDay(day);
    const signatureBreaks = mapped.breaks.map((entry) => ({
      start: entry.start,
      end: entry.end,
      title: entry.title ?? null,
    }));
    const signature = `${mapped.startLocal}|${mapped.endLocal}|${JSON.stringify(signatureBreaks)}`;
    const templateId = templateIdBySignature.get(signature) ?? null;
    return {
      configId: config.id,
      weekday: day.dayOfWeek + 1,
      templateId,
      isActive: Boolean(templateId),
      scheduleMode: day.scheduleMode,
      fixedSlotTimes: day.fixedSlotTimes,
    };
  });

  await prisma.weeklyScheduleDay.deleteMany({ where: { configId: config.id } });
  if (rows.length > 0) {
    await prisma.weeklyScheduleDay.createMany({ data: rows });
  }
  await prisma.weeklyScheduleConfig.update({ where: { id: config.id }, data: {} });

  const usedAutoTemplateIds = new Set(Array.from(templateIdBySignature.values()));
  await prisma.scheduleTemplate.deleteMany({
    where: {
      providerId,
      name: { startsWith: AUTO_TEMPLATE_PREFIX },
      id: { notIn: Array.from(usedAutoTemplateIds) },
    },
  });
}

async function saveException(providerId: string, input: EditorExceptionInput): Promise<void> {
  const date = parseDateKeyToUtcStart(input.date);
  const existing = await prisma.scheduleOverride.findFirst({
    where: { providerId, date },
    select: { id: true },
  });

  const kind = input.isWorkday ? "TIME_RANGE" : "OFF";
  const isDayOff = !input.isWorkday;

  if (existing) {
    await prisma.scheduleOverride.update({
      where: { id: existing.id },
      data: {
        kind,
        isDayOff,
        isWorkday: input.isWorkday,
        startLocal: input.isWorkday ? input.startTime : null,
        endLocal: input.isWorkday ? input.endTime : null,
        templateId: null,
        isActive: null,
        scheduleMode: input.scheduleMode,
        fixedSlotTimes: input.scheduleMode === "FIXED" ? input.fixedSlotTimes : [],
        note: input.note,
      },
    });
  } else {
    await prisma.scheduleOverride.create({
      data: {
        providerId,
        date,
        kind,
        isDayOff,
        isWorkday: input.isWorkday,
        startLocal: input.isWorkday ? input.startTime : null,
        endLocal: input.isWorkday ? input.endTime : null,
        scheduleMode: input.scheduleMode,
        fixedSlotTimes: input.scheduleMode === "FIXED" ? input.fixedSlotTimes : [],
        note: input.note,
      },
    });
  }

  await prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } });
  if (input.isWorkday && input.scheduleMode === "FLEXIBLE" && input.breaks.length > 0) {
    await prisma.scheduleBreak.createMany({
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

async function removeExceptionByDate(providerId: string, dateKey: string): Promise<void> {
  const date = parseDateKeyToUtcStart(dateKey);
  await prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } });
  await prisma.scheduleOverride.deleteMany({ where: { providerId, date } });
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
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
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

  const [config, overrides, overrideBreaks] = await Promise.all([
    prisma.weeklyScheduleConfig.findUnique({
      where: { providerId },
      select: {
        days: {
          orderBy: { weekday: "asc" },
          select: {
            weekday: true,
            isActive: true,
            scheduleMode: true,
            fixedSlotTimes: true,
            template: {
              select: {
                startLocal: true,
                endLocal: true,
                breaks: {
                  select: { startLocal: true, endLocal: true, sortOrder: true, title: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.scheduleOverride.findMany({
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
            breaks: {
              select: { startLocal: true, endLocal: true, sortOrder: true, title: true },
            },
          },
        },
      },
    }),
    prisma.scheduleBreak.findMany({
      where: { providerId, kind: "OVERRIDE", date: { not: null } },
      select: { date: true, startLocal: true, endLocal: true },
      orderBy: [{ date: "asc" }, { startLocal: "asc" }],
    }),
  ]);

  const weekSchedule = buildDefaultWeekSchedule();
  for (const day of config?.days ?? []) {
    const index = day.weekday - 1;
    if (index < 0 || index > 6) continue;
    const templateBreaks =
      day.template?.breaks
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
          start: item.startLocal,
          end: item.endLocal,
          title: item.title ?? null,
        })) ?? [];
    weekSchedule[index] = {
      dayOfWeek: index,
      isWorkday: Boolean(day.isActive && day.template),
      scheduleMode: day.scheduleMode,
      startTime: day.template?.startLocal ?? weekSchedule[index].startTime,
      endTime: day.template?.endLocal ?? weekSchedule[index].endTime,
      breaks: templateBreaks,
      fixedSlotTimes: normalizeFixedSlotTimes(day.fixedSlotTimes),
    };
  }

  const overrideBreaksByDate = new Map<string, BreakDto[]>();
  for (const row of overrideBreaks) {
    if (!row.date) continue;
    const key = toLocalDateKey(row.date, provider.timezone);
    const list = overrideBreaksByDate.get(key) ?? [];
    list.push({ start: row.startLocal, end: row.endLocal, title: null });
    overrideBreaksByDate.set(key, list);
  }

  const exceptions: ScheduleExceptionDto[] = overrides.map((row) => {
    const dateKey = toLocalDateKey(row.date, provider.timezone);
    const isWorkday = row.isWorkday ?? !row.isDayOff;
    const scheduleMode =
      row.scheduleMode ??
      (normalizeFixedSlotTimes(row.fixedSlotTimes).length > 0 ? "FIXED" : "FLEXIBLE");
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
      fixedSlotTimes: normalizeFixedSlotTimes(row.fixedSlotTimes),
    };
  });

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
    exceptions,
    templates: WEEK_TEMPLATE_OPTIONS,
    bookingRules,
    visibility,
    hotSlots,
  };
}

/**
 * Atomically writes Provider settings + DiscountRule for hot slots. Runs
 * inside `prisma.$transaction` so a half-applied state is impossible —
 * either both Provider and DiscountRule write, or neither.
 *
 * Hot-slot semantics: input.hotSlots === null → toggle off (DiscountRule
 * stays in DB but `isEnabled = false`, preserving previous tuning).
 * input.hotSlots = object → toggle on + write values; preserves the
 * detailed page's `minPriceFrom` / `serviceIds` if a row already exists.
 */
async function applyProviderAndDiscountRule(
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

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  });
}

export async function applyScheduleSnapshot(
  providerId: string,
  input: {
    weekSchedule: DayScheduleDto[];
    exceptions: Array<Omit<ScheduleExceptionDto, "id">>;
    slotStepMin?: number;
    bufferBetweenBookingsMin?: number;
    bookingRules?: BookingRulesDto;
    visibility?: VisibilityDto;
    /** Pass `null` to disable, an object to enable + write values. Omit to leave alone. */
    hotSlots?: HotSlotsDto | null;
  }
): Promise<void> {
  const weekSchedule = normalizeWeekScheduleInput(input.weekSchedule as unknown);
  const normalizedExceptions = input.exceptions
    .map((item) => normalizeExceptionInput(item))
    .sort((left, right) => left.date.localeCompare(right.date));

  await applyProviderAndDiscountRule(providerId, input);

  await saveWeekSchedule(providerId, weekSchedule);

  const existing = await prisma.scheduleOverride.findMany({
    where: { providerId },
    select: { date: true },
  });
  const existingDateKeys = new Set(existing.map((item) => item.date.toISOString().slice(0, 10)));
  const nextDateKeys = new Set<string>();

  for (const item of normalizedExceptions) {
    await saveException(providerId, item);
    nextDateKeys.add(item.date);
  }

  for (const key of existingDateKeys) {
    if (!nextDateKeys.has(key)) {
      await removeExceptionByDate(providerId, key);
    }
  }

  await invalidateSlotsForMaster(providerId);
}

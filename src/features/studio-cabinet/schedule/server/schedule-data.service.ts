import {
  BookingStatus,
  ProviderType,
  type TimeBlockType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import {
  FREE_WINDOW_FALLBACK_MIN,
  computeFreeWindows,
  freeWindowsCount,
  nowMinuteForDay,
  type FreeWindowsDay,
  type MinuteRange,
} from "@/lib/schedule/free-windows";
import { bookingToneFromStatus } from "../lib/booking-status-display";
import { mapProposedReschedule } from "../lib/reschedule-decision";
import {
  parseDateKey,
  resolveGridWindow,
  salonMinuteOfDay,
  toDateKey,
} from "../lib/time-grid";
import { dayPlanHours, dayPlanWorkMinutes, loadDayPlans } from "@/lib/schedule/day-plans";
import { timeToMinutes } from "@/lib/schedule/time";
import type { DayPlan } from "@/lib/schedule/types";
import type {
  ScheduleBookingCell,
  ScheduleBreakCell,
  ScheduleDayData,
  ScheduleKpis,
  ScheduleMasterColumn,
  ScheduleWeekData,
  ScheduleWeekDay,
  ScheduleWeekRow,
  StudioScheduleData,
} from "./types";
import { isStudioSurfaceBooking, studioBookingsWhere } from "@/lib/studio/booking-scope";
import { loadStudioWeekCells } from "./calendar-week.service";

/**
 * Studio admin booking operations (create/move/cancel) are DIRECT —
 * no `ScheduleChangeRequest` approval needed. Admin has authority over
 * studio bookings.
 *
 * `ScheduleChangeRequest` approval flow
 * (STUDIO-SCHEDULE-REQUEST-APPROVAL-A) applies ONLY to master-initiated
 * working-hours / day-off changes, NOT to individual booking
 * operations. This service therefore reads/writes Booking and
 * TimeBlock tables directly; the approval queue lives on a separate
 * page (`/cabinet/studio/schedule-requests`).
 *
 * SCHEDULE-FLEX-DATE-NAV (2026-10-30): день и неделя собираются одной
 * загрузкой диапазона (`loadRange`) — неделя теперь показывает записи
 * мастеров, а не только проценты; показатели и свободные окошки считаются
 * по плану дня движка (часы, перерывы, «Фиксированное время»).
 */

const ACTIVE_BOOKING_STATUSES_NOTIN = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

const CONFIRMED_STATUSES: ReadonlySet<BookingStatus> = new Set([
  BookingStatus.CONFIRMED,
  BookingStatus.PREPAID,
  BookingStatus.STARTED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
]);

const DAY_MINUTES = 24 * 60;
/**
 * Загрузка дня «Фиксированное время» в минутах не меряется (ёмкость — число
 * начал). Для общего процента периода одно начало считается часом — так оно
 * весит наравне с часом обычного дня.
 */
const FIXED_SLOT_WEIGHT_MIN = 60;

function startOfUtcWeekMonday(now: Date): Date {
  const day = now.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + offset);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function resolveBookingPriceKopeks(input: {
  service: { price: number } | null;
  serviceItems: Array<{ priceSnapshot: number }>;
}): number {
  const snapshotSum = input.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.priceSnapshot),
    0,
  );
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, input.service?.price ?? 0);
}

/**
 * BOOKING-FLOW-AUDIT-RESIDUALS · rule 17 (salon-tz) — границы дня календаря
 * студии — сутки САЛОНА, а не UTC. Раньше день запрашивался UTC-сутками:
 * у студии в GMT+10 записи с 00:00 до 10:00 по салону попадали в предыдущий
 * день календаря, а в выбранный — не попадали вовсе.
 */
function salonDayBounds(dateKey: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: dateFromLocalDateKey(dateKey, timeZone, 0, 0),
    end: dateFromLocalDateKey(addDaysToDateKey(dateKey, 1), timeZone, 0, 0),
  };
}

/** Отрезок `[start, end)` в минутах дня салона `dayStart…dayEnd`; вне дня — `null`. */
function clampToSalonDay(
  startIso: string,
  endIso: string,
  bounds: { start: Date; end: Date },
  timeZone: string,
): MinuteRange | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (end.getTime() <= bounds.start.getTime() || start.getTime() >= bounds.end.getTime()) return null;
  const startMin = start.getTime() <= bounds.start.getTime() ? 0 : salonMinuteOfDay(start, timeZone);
  const endMin = end.getTime() >= bounds.end.getTime() ? DAY_MINUTES : salonMinuteOfDay(end, timeZone);
  return endMin > startMin ? { startMin, endMin } : null;
}

function parsePlanRange(range: { start: string; end: string }): MinuteRange | null {
  const startMin = timeToMinutes(range.start);
  const endMin = timeToMinutes(range.end);
  if (startMin === null || endMin === null || endMin <= startMin) return null;
  return { startMin, endMin };
}

const MASTER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  studioPaused: true,
  ownerUserId: true,
  ratingAvg: true,
  ratingCount: true,
  // SCHEDULE-FLEX-DATE-NAV: пауза между записями — граница свободного окошка.
  bufferBetweenBookingsMin: true,
  // STUDIO-RESCHEDULE-VALIDATION-A: surface enabled MasterService
  // ids so the move dialog can gate the master picker. Disabled
  // rows are excluded — same predicate the backend uses for
  // `assertMasterPerformsService`.
  // SCHEDULE-FLEX-DATE-NAV: длительности — самая короткая услуга мастера,
  // промежуток короче неё в окошки не попадает.
  masterServices: {
    where: { isEnabled: true },
    select: {
      serviceId: true,
      durationOverrideMin: true,
      service: { select: { durationMin: true, isEnabled: true, isActive: true } },
    },
  },
  // STUDIO-MASTER-PROFILES (этап 4): другие профили того же человека —
  // его личная занятость рисуется в колонке профиля в студии.
  owner: { select: { providers: { where: { type: ProviderType.MASTER }, select: { id: true } } } },
} as const;

type StudioMasterRow = {
  id: string;
  name: string;
  avatarUrl: string | null;
  studioPaused: boolean;
  ownerUserId: string | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  bufferBetweenBookingsMin?: number | null;
  masterServices: Array<{
    serviceId: string;
    durationOverrideMin?: number | null;
    service?: { durationMin: number; isEnabled: boolean; isActive: boolean } | null;
  }>;
  owner?: { providers: Array<{ id: string }> } | null;
};

/** Самая короткая услуга мастера в студии; услуг нет — нижняя ступень сетки. */
function shortestServiceMin(master: StudioMasterRow): number {
  const durations = master.masterServices
    .filter((link) => link.service?.isEnabled !== false && link.service?.isActive !== false)
    .map((link) => link.durationOverrideMin ?? link.service?.durationMin ?? 0)
    .filter((value) => value > 0);
  return durations.length > 0 ? Math.min(...durations) : FREE_WINDOW_FALLBACK_MIN;
}

type RangeData = {
  masters: StudioMasterRow[];
  columns: ScheduleMasterColumn[];
  /** Записи диапазона по времени начала. */
  bookings: ScheduleBookingCell[];
  breaks: ScheduleBreakCell[];
  /** План дня активных мастеров: id колонки → дата → план. */
  plans: Map<string, Map<string, DayPlan>>;
};

/**
 * Мастера, записи и перерывы студии за `days` дней салона с `fromKey`, плюс
 * план дня движка для активных мастеров. Общая загрузка дня и недели.
 */
async function loadRange(input: {
  studioId: string;
  providerId: string;
  fromKey: string;
  days: number;
  timeZone: string;
  now: Date;
}): Promise<RangeData> {
  const { studioId, providerId, timeZone } = input;
  const toKeyExclusive = addDaysToDateKey(input.fromKey, input.days);
  const rangeStart = dateFromLocalDateKey(input.fromKey, timeZone, 0, 0);
  const rangeEnd = dateFromLocalDateKey(toKeyExclusive, timeZone, 0, 0);

  const [masterRows, bookings, blocks] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: providerId },
      select: MASTER_SELECT,
      orderBy: { name: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        OR: [
          studioBookingsWhere(studioId),
          // STUDIO-MASTER-PROFILES (этап 4): после разделения личная запись
          // мастера — на его ЛИЧНОМ профиле (`studioId = null`), и клоз ниже
          // её уже не видит. Занятость человека общая, поэтому студия видит
          // её по связи «исполнитель — человек, у которого есть профиль в
          // этой студии».
          {
            masterProvider: {
              owner: { providers: { some: { type: ProviderType.MASTER, studioId: providerId } } },
            },
          },
          {
            masterProviderId: null,
            provider: {
              type: ProviderType.MASTER,
              owner: { providers: { some: { type: ProviderType.MASTER, studioId: providerId } } },
            },
          },
          // LOGIC-01: бронь того же мастера, созданная через его ЛИЧНЫЙ профиль,
          // имеет `studioId = null` и `providerId = мастер` — ни один из двух
          // прежних клозов её не матчил, и календарь показывал слот свободным.
          // Админ не видел занятость собственного мастера, а предикат конфликта
          // (тоже поправленный) отказывал бы «на пустом месте» с его точки
          // зрения. Фильтр по связи, а не по списку id, чтобы не разрывать
          // `Promise.all` с запросом мастеров.
          { masterProvider: { studioId: providerId } },
        ],
        startAtUtc: { gte: rangeStart, lt: rangeEnd },
        status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
      },
      select: {
        id: true,
        studioId: true,
        masterProviderId: true,
        providerId: true,
        serviceId: true,
        startAtUtc: true,
        endAtUtc: true,
        status: true,
        clientName: true,
        clientPhone: true,
        clientUserId: true,
        // BOOKING-STUDIO-RESCHEDULE-PARITY-01: surface a pending client-proposed
        // reschedule so the calendar cell + action menu can offer accept/decline.
        proposedStartAt: true,
        proposedEndAt: true,
        actionRequiredBy: true,
        bookingPackageId: true,
        service: { select: { name: true, title: true, price: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
      orderBy: { startAtUtc: "asc" },
    }),
    prisma.timeBlock.findMany({
      where: {
        studioId,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: {
        id: true,
        masterId: true,
        startAt: true,
        endAt: true,
        type: true,
        note: true,
      },
    }),
  ]);
  const masters = masterRows as StudioMasterRow[];

  // STUDIO-MASTER-OWN-BOOKINGS-01: личная запись мастера — не запись студии.
  // Та же развилка, что у права на управление (`auth/ownership.ts`): студия
  // управляет записью её поверхности (`studioId` либо её `providerId`).
  const isPersonalBooking = (b: { studioId: string | null; providerId: string }) =>
    !isStudioSurfaceBooking(b, studioId);

  // Per-master first-time-client detection — a single grouped query
  // gives every client's earliest booking in the studio; the booking
  // in the range is "new" if its id matches the earliest.
  const clientKeys = bookings
    .filter((booking) => !isPersonalBooking(booking))
    .map((booking) => booking.clientUserId)
    .filter((value): value is string => Boolean(value));
  const activeIds = masters.filter((master) => isStudioMasterActive(master)).map((master) => master.id);

  // SCHEDULE-PATTERNS-01: часы мастеров — из движка одним пакетом.
  const [earliest, plans] = await Promise.all([
    clientKeys.length > 0
      ? prisma.booking.findMany({
          where: {
            ...studioBookingsWhere(studioId),
            clientUserId: { in: Array.from(new Set(clientKeys)) },
          },
          orderBy: { startAtUtc: "asc" },
          select: { id: true, clientUserId: true },
        })
      : Promise.resolve([] as Array<{ id: string; clientUserId: string | null }>),
    loadDayPlans({ providerIds: activeIds, fromKey: input.fromKey, toKeyExclusive, now: input.now }),
  ]);
  const earliestByClient = new Map<string, string>();
  for (const row of earliest) {
    if (!row.clientUserId) continue;
    if (!earliestByClient.has(row.clientUserId)) earliestByClient.set(row.clientUserId, row.id);
  }

  // STUDIO-BUGS-FIX-A bug #5: INVITED masters (no ownerUserId) render as
  // disabled columns — they cannot accept bookings until the invite is
  // accepted. `isStudioMasterActive` covers both ownership + studio pause.
  // Профиль человека → колонка его профиля в этой студии.
  const columnByProfile = new Map<string, string>();
  for (const master of masters) {
    for (const sibling of master.owner?.providers ?? []) columnByProfile.set(sibling.id, master.id);
    columnByProfile.set(master.id, master.id);
  }

  const columns: ScheduleMasterColumn[] = masters.map((master) => ({
    id: master.id,
    name: master.name,
    avatarUrl: master.avatarUrl ?? null,
    rating: master.ratingAvg ?? 0,
    reviewsCount: master.ratingCount ?? 0,
    isAvailable: isStudioMasterActive(master),
    serviceIds: master.masterServices.map((row) => row.serviceId),
  }));

  const bookingCells: ScheduleBookingCell[] = bookings
    .filter((b) => b.startAtUtc && b.endAtUtc)
    .map((b) => {
      const performerId = b.masterProviderId ?? b.providerId;
      const masterId = columnByProfile.get(performerId) ?? performerId;
      if (isPersonalBooking(b)) {
        // Только занятость: ни имени и телефона клиента, ни услуги с ценой,
        // ни предложения переноса — студия этой записью не управляет.
        return {
          id: b.id,
          masterId,
          startAtUtc: b.startAtUtc!.toISOString(),
          endAtUtc: b.endAtUtc!.toISOString(),
          status: b.status,
          tone: bookingToneFromStatus(b.status),
          clientName: "",
          clientPhone: null,
          isNewClient: false,
          serviceTitle: "",
          serviceId: b.serviceId,
          priceKopeks: 0,
          proposedStartAtUtc: null,
          proposedEndAtUtc: null,
          actionRequiredBy: null,
          bookingPackageId: null,
          isPersonal: true,
        };
      }
      const isNew =
        b.clientUserId !== null &&
        earliestByClient.get(b.clientUserId) === b.id;
      return {
        id: b.id,
        masterId,
        startAtUtc: b.startAtUtc!.toISOString(),
        endAtUtc: b.endAtUtc!.toISOString(),
        status: b.status,
        tone: isNew && bookingToneFromStatus(b.status) === "confirmed"
          ? "new"
          : bookingToneFromStatus(b.status),
        clientName: b.clientName,
        clientPhone: b.clientPhone || null,
        isNewClient: isNew,
        serviceTitle: b.service?.title?.trim() || b.service?.name || "Услуга",
        serviceId: b.serviceId,
        priceKopeks: resolveBookingPriceKopeks(b),
        ...mapProposedReschedule(b),
        bookingPackageId: b.bookingPackageId ?? null,
        isPersonal: false,
      };
    });

  const breakCells: ScheduleBreakCell[] = blocks.map((block) => ({
    id: block.id,
    masterId: block.masterId,
    startAtUtc: block.startAt.toISOString(),
    endAtUtc: block.endAt.toISOString(),
    type: block.type as TimeBlockType,
    note: block.note,
  }));

  return { masters, columns, bookings: bookingCells, breaks: breakCells, plans };
}

/** Что считается по каждому «мастер × день» периода: окошки и загрузка. */
type MasterDayStats = {
  masterId: string;
  dateKey: string;
  isWorking: boolean;
  free: FreeWindowsDay;
  capacityMin: number;
  bookedMin: number;
};

function buildMasterDayStats(input: {
  range: RangeData;
  dateKeys: readonly string[];
  timeZone: string;
  todayKey: string;
  nowMinuteOfToday: number;
}): MasterDayStats[] {
  const { range, timeZone } = input;
  const out: MasterDayStats[] = [];
  for (const dateKey of input.dateKeys) {
    const bounds = salonDayBounds(dateKey, timeZone);
    for (const master of range.masters) {
      if (!isStudioMasterActive(master)) continue;
      const plan = range.plans.get(master.id)?.get(dateKey);
      const bookings = range.bookings
        .filter((cell) => cell.masterId === master.id)
        .map((cell) => clampToSalonDay(cell.startAtUtc, cell.endAtUtc, bounds, timeZone))
        .filter((value): value is MinuteRange => value !== null);
      const blocks = range.breaks
        .filter((cell) => cell.masterId === master.id)
        .map((cell) => clampToSalonDay(cell.startAtUtc, cell.endAtUtc, bounds, timeZone))
        .filter((value): value is MinuteRange => value !== null);
      const isWorking = plan?.isWorking === true;
      const fixedStarts = plan?.fixedStarts ?? null;
      const free = computeFreeWindows({
        isWorking,
        workingIntervals: (plan?.workingIntervals ?? [])
          .map(parsePlanRange)
          .filter((value): value is MinuteRange => value !== null),
        breaks: (plan?.breaks ?? []).map(parsePlanRange).filter((value): value is MinuteRange => value !== null),
        fixedStarts,
        bookings,
        blocks,
        bufferMin: master.bufferBetweenBookingsMin ?? 0,
        minDurationMin: shortestServiceMin(master),
        nowMinute: nowMinuteForDay(dateKey, input.todayKey, input.nowMinuteOfToday),
      });

      let capacityMin = 0;
      let bookedMin = 0;
      if (isWorking && fixedStarts) {
        capacityMin = fixedStarts.length * FIXED_SLOT_WEIGHT_MIN;
        bookedMin = Math.min(bookings.length, fixedStarts.length) * FIXED_SLOT_WEIGHT_MIN;
      } else if (isWorking) {
        capacityMin = Math.max(0, dayPlanWorkMinutes(plan) ?? 0);
        bookedMin = bookings.reduce((sum, range) => sum + (range.endMin - range.startMin), 0);
      }
      out.push({ masterId: master.id, dateKey, isWorking, free, capacityMin, bookedMin });
    }
  }
  return out;
}

function computeKpis(input: {
  bookings: readonly ScheduleBookingCell[];
  stats: readonly MasterDayStats[];
}): ScheduleKpis {
  // Записи и выручка — студийные; личные записи мастеров занимают время
  // (загрузка и свободные окошки их учитывают), но записями студии не являются.
  const studioBookings = input.bookings.filter((b) => !b.isPersonal);
  const capacityMin = input.stats.reduce((sum, row) => sum + row.capacityMin, 0);
  const bookedMin = input.stats.reduce((sum, row) => sum + row.bookedMin, 0);
  const onShift = new Set(input.stats.filter((row) => row.isWorking).map((row) => row.masterId));

  return {
    bookingsCount: studioBookings.length,
    bookingsConfirmedCount: studioBookings.filter((b) => CONFIRMED_STATUSES.has(b.status)).length,
    revenueKopeks: studioBookings.reduce((sum, b) => sum + b.priceKopeks, 0),
    occupancyPercent: capacityMin > 0 ? Math.min(100, Math.round((bookedMin / capacityMin) * 100)) : 0,
    occupancyHoursDenominator: Math.round(capacityMin / 60),
    mastersOnShift: onShift.size,
    freeWindowsCount: input.stats.reduce((sum, row) => sum + freeWindowsCount(row.free), 0),
  };
}

function freeWindowsByMaster(
  range: RangeData,
  stats: readonly MasterDayStats[],
  todayKey: string,
): StudioScheduleData["freeWindows"] {
  return range.masters
    .filter((master) => isStudioMasterActive(master))
    .map((master) => ({
      masterId: master.id,
      masterName: master.name,
      days: stats
        .filter((row) => row.masterId === master.id)
        .map((row) => ({
          dateKey: row.dateKey,
          isOff: !row.isWorking,
          past: row.dateKey < todayKey,
          windows: row.free.windows,
          freeStarts: row.free.freeStarts,
        })),
    }));
}

function buildDay(range: RangeData, dateKey: string, timeZone: string): ScheduleDayData {
  const { start: dayStart, end: dayEnd } = salonDayBounds(dateKey, timeZone);
  const inDay = <T extends { startAtUtc: string; endAtUtc: string }>(cell: T) =>
    new Date(cell.startAtUtc).getTime() < dayEnd.getTime() && new Date(cell.endAtUtc).getTime() > dayStart.getTime();
  const bookings = range.bookings.filter(
    (cell) => new Date(cell.startAtUtc).getTime() >= dayStart.getTime() && new Date(cell.startAtUtc).getTime() < dayEnd.getTime(),
  );
  const breaks = range.breaks.filter(inDay);

  // BOOKING-FLOW-AUDIT-RESIDUALS: сетка дня раздвигается под часы активных
  // мастеров, записи и перерывы этого дня (минимум — 09–21). Интервал через
  // полночь салона прижимается к краю суток.
  const minuteOfSalonDay = (instant: Date): number => {
    if (instant.getTime() <= dayStart.getTime()) return 0;
    if (instant.getTime() >= dayEnd.getTime()) return DAY_MINUTES;
    return salonMinuteOfDay(instant, timeZone);
  };
  // День с фиксированным временем хранится как 00:00–23:55; сетке нужны
  // выбранные начала, а не сутки.
  const gridMinutes: number[] = [];
  for (const byDate of range.plans.values()) {
    const plan = byDate.get(dateKey);
    if (!plan?.isWorking) continue;
    if (plan.fixedStarts) {
      const starts = plan.fixedStarts
        .map((value) => timeToMinutes(value))
        .filter((value): value is number => value !== null);
      if (starts.length === 0) continue;
      gridMinutes.push(Math.min(...starts), Math.min(DAY_MINUTES, Math.max(...starts) + 60));
      continue;
    }
    const hours = dayPlanHours(plan);
    const start = hours.start ? timeToMinutes(hours.start) : null;
    const end = hours.end ? timeToMinutes(hours.end) : null;
    if (start === null || end === null) continue;
    gridMinutes.push(start, end);
  }
  for (const cell of [...bookings, ...breaks]) {
    gridMinutes.push(minuteOfSalonDay(new Date(cell.startAtUtc)), minuteOfSalonDay(new Date(cell.endAtUtc)));
  }

  return {
    dateKey,
    dayStartIso: dayStart.toISOString(),
    gridWindow: resolveGridWindow(gridMinutes),
    columns: range.columns,
    bookings,
    breaks,
  };
}

const WEEKDAY_SHORT_RU = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const;

async function buildWeek(input: {
  studioId: string;
  range: RangeData;
  weekStartKey: string;
  // EXP-020: "today" resolved in the STUDIO's own tz (YYYY-MM-DD), not the UTC
  // calendar day — so the highlighted column matches the master/client cabinets
  // (which all key "today" off `toLocalDateKey(now, entityTz)`).
  todayKey: string;
  timeZone: string;
  stats: readonly MasterDayStats[];
  now: Date;
}): Promise<ScheduleWeekData> {
  const { range, weekStartKey, timeZone } = input;

  // MOBILE-POLISH: ячейки — по НАСТОЯЩЕМУ графику мастера, тем же расчётом,
  // что неделя приложения (`GET /api/cabinet/studio/calendar/week`): ёмкость —
  // рабочие минуты без перерывов (или фиксированные начала), выходной — по
  // графику. Планы дня — те же, что у окошек (второй раз движок не зовётся).
  const cellsByMaster = await loadStudioWeekCells({
    studioId: input.studioId,
    timezone: timeZone,
    from: weekStartKey,
    masters: range.masters.map((master) => ({ id: master.id, active: isStudioMasterActive(master) })),
    now: input.now,
    plans: range.plans,
  });

  const days: ScheduleWeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const key = addDaysToDateKey(weekStartKey, index);
    return {
      dateKey: key,
      weekdayLabel: WEEKDAY_SHORT_RU[index],
      dayNumber: Number(key.slice(8, 10)),
      isToday: key === input.todayKey,
      isPast: key < input.todayKey,
    };
  });

  const bookingsByCell = new Map<string, ScheduleWeekData["rows"][number]["cells"][number]["bookings"]>();
  for (const cell of range.bookings) {
    const key = `${cell.masterId}|${toLocalDateKey(new Date(cell.startAtUtc), timeZone)}`;
    const list = bookingsByCell.get(key) ?? [];
    list.push({
      id: cell.id,
      startAtUtc: cell.startAtUtc,
      endAtUtc: cell.endAtUtc,
      status: cell.status,
      tone: cell.tone,
      clientName: cell.clientName,
      serviceTitle: cell.serviceTitle,
      isPersonal: cell.isPersonal,
    });
    bookingsByCell.set(key, list);
  }
  const freeByCell = new Map(input.stats.map((row) => [`${row.masterId}|${row.dateKey}`, row.free]));
  const NO_FREE: FreeWindowsDay = { windows: [], freeStarts: null };

  // STUDIO-BUGS-FIX-A bug #5: INVITED masters get zero capacity + isDayOff
  // across the whole week. They surface in the grid so admin sees they
  // exist, but with no schedulable hours.
  const rows: ScheduleWeekRow[] = range.masters.map((master, index) => ({
    master: range.columns[index]!,
    cells: (cellsByMaster.get(master.id) ?? []).map((cell) => ({
      dateKey: cell.date,
      booked: cell.booked,
      bookedMinutes: cell.bookedMinutes,
      capacityMinutes: cell.capacityMinutes,
      fixedSlots: cell.fixedSlots,
      percent: cell.percent,
      isDayOff: cell.isDayOff,
      bookings: bookingsByCell.get(`${master.id}|${cell.date}`) ?? [],
      freeWindows: freeByCell.get(`${master.id}|${cell.date}`) ?? NO_FREE,
    })),
  }));

  return { days, rows };
}

async function loadServices(
  studioId: string,
  providerId: string,
): Promise<StudioScheduleData["services"]> {
  const [services, masterServices] = await Promise.all([
    prisma.service.findMany({
      // MOBILE-STUDIO-C (ops): архивную услугу (`isActive: false`) создание
      // записи отклоняет («Услуга не найдена.») — в выборе её быть не должно.
      where: { studioId, isEnabled: true, isActive: true },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.masterService.findMany({
      where: {
        isEnabled: true,
        masterProvider: { type: ProviderType.MASTER, studioId: providerId },
      },
      select: { masterProviderId: true, serviceId: true },
    }),
  ]);

  const mastersByService = new Map<string, string[]>();
  for (const link of masterServices) {
    const arr = mastersByService.get(link.serviceId) ?? [];
    arr.push(link.masterProviderId);
    mastersByService.set(link.serviceId, arr);
  }

  return services.map((service) => ({
    id: service.id,
    name: service.title?.trim() || service.name,
    durationMin: service.durationMin,
    priceKopeks: service.price,
    masterIds: mastersByService.get(service.id) ?? [],
  }));
}

export async function loadStudioScheduleData(input: {
  studioId: string;
  // EXP-020: optional — when the URL has no valid `?date`, the default day is
  // resolved in the STUDIO's tz (not the UTC/host calendar day).
  dateKey?: string;
  view: "day" | "week";
  now?: Date;
}): Promise<StudioScheduleData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true, provider: { select: { timezone: true } } },
  });
  if (!studio) {
    throw new Error(`Studio not found: ${input.studioId}`);
  }

  const now = input.now ?? new Date();
  const timeZone = studio.provider.timezone;
  const todayKey = toLocalDateKey(now, timeZone);
  const effectiveDateKey = input.dateKey ?? todayKey;
  // Неделя — календарная арифметика над ключами дат, границы — в поясе салона.
  const fromKey =
    input.view === "week" ? toDateKey(startOfUtcWeekMonday(parseDateKey(effectiveDateKey))) : effectiveDateKey;
  const dayCount = input.view === "week" ? 7 : 1;

  const [range, services] = await Promise.all([
    loadRange({ studioId: studio.id, providerId: studio.providerId, fromKey, days: dayCount, timeZone, now }),
    loadServices(studio.id, studio.providerId),
  ]);
  const dateKeys = Array.from({ length: dayCount }, (_, index) => addDaysToDateKey(fromKey, index));
  const stats = buildMasterDayStats({
    range,
    dateKeys,
    timeZone,
    todayKey,
    nowMinuteOfToday: salonMinuteOfDay(now, timeZone),
  });

  const week =
    input.view === "week"
      ? await buildWeek({ studioId: studio.id, range, weekStartKey: fromKey, todayKey, timeZone, stats, now })
      : null;

  return {
    dateKey: effectiveDateKey,
    view: input.view,
    timezone: timeZone,
    todayKey,
    // День — выбранная дата: на неё смотрят диалоги («Перерывы», новая запись).
    day: buildDay(range, effectiveDateKey, timeZone),
    week,
    freeWindows: freeWindowsByMaster(range, stats, todayKey),
    services,
  };
}

/**
 * DASHBOARD-REORDER (запрос владельца 2026-10-31) — «Свободные окошки» на
 * главной студии: тот же расчёт, что окно «Свободные окошки» календаря
 * (`buildMasterDayStats` → `computeFreeWindows` из плана дня движка, записи с
 * паузой мастера, перерывы и блокировки), по активным мастерам на `days` дней
 * с сегодняшнего дня салона. Без сетки календаря, недели и каталога услуг.
 */
export async function loadStudioFreeWindows(input: {
  studioId: string;
  providerId: string;
  timeZone: string;
  days?: number;
  now?: Date;
}): Promise<{ todayKey: string; masters: StudioScheduleData["freeWindows"] }> {
  const now = input.now ?? new Date();
  const days = input.days ?? 7;
  const todayKey = toLocalDateKey(now, input.timeZone);
  const range = await loadRange({
    studioId: input.studioId,
    providerId: input.providerId,
    fromKey: todayKey,
    days,
    timeZone: input.timeZone,
    now,
  });
  const dateKeys = Array.from({ length: days }, (_, index) => addDaysToDateKey(todayKey, index));
  const stats = buildMasterDayStats({
    range,
    dateKeys,
    timeZone: input.timeZone,
    todayKey,
    nowMinuteOfToday: salonMinuteOfDay(now, input.timeZone),
  });
  return { todayKey, masters: freeWindowsByMaster(range, stats, todayKey) };
}

/**
 * MOBILE-STUDIO-C (ops) — день календаря студии для приложения: та же сборка
 * дня, что у веба (`loadRange` + `buildDay`), показатели дня (`computeKpis` —
 * веб их больше не показывает: суммы — в аналитике), плюс план дня каждого
 * активного мастера из движка расписания. Без каталога услуг и недели.
 */
export async function loadStudioScheduleDay(input: {
  studioId: string;
  dateKey?: string;
  now?: Date;
}): Promise<{
  studioId: string;
  timezone: string;
  todayKey: string;
  day: ScheduleDayData;
  kpis: ScheduleKpis;
  plans: Map<string, DayPlan>;
} | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true, provider: { select: { timezone: true } } },
  });
  if (!studio) return null;

  const now = input.now ?? new Date();
  const timezone = studio.provider.timezone;
  const todayKey = toLocalDateKey(now, timezone);
  const dateKey = input.dateKey ?? todayKey;
  const range = await loadRange({
    studioId: studio.id,
    providerId: studio.providerId,
    fromKey: dateKey,
    days: 1,
    timeZone: timezone,
    now,
  });
  const stats = buildMasterDayStats({
    range,
    dateKeys: [dateKey],
    timeZone: timezone,
    todayKey,
    nowMinuteOfToday: salonMinuteOfDay(now, timezone),
  });

  const plans = new Map<string, DayPlan>();
  for (const [masterId, byDate] of range.plans) {
    const plan = byDate.get(dateKey);
    if (plan) plans.set(masterId, plan);
  }
  return {
    studioId: studio.id,
    timezone,
    todayKey,
    day: buildDay(range, dateKey, timezone),
    kpis: computeKpis({ bookings: range.bookings, stats }),
    plans,
  };
}

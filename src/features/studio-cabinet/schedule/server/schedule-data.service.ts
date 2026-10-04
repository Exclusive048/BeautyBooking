import {
  BookingStatus,
  ProviderType,
  type TimeBlockType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { bookingToneFromStatus } from "../lib/booking-status-display";
import { mapProposedReschedule } from "../lib/reschedule-decision";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  parseDateKey,
  resolveGridWindow,
  salonMinuteOfDay,
  toDateKey,
} from "../lib/time-grid";
import { dayPlanHours, loadDayPlans } from "@/lib/schedule/day-plans";
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
 */

const ACTIVE_BOOKING_STATUSES_NOTIN = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

const DAILY_CAPACITY = 5;

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

type DayBuild = {
  day: ScheduleDayData;
  /**
   * MOBILE-STUDIO-C (ops): план дня каждого АКТИВНОГО мастера (id колонки →
   * план движка на `dateKey`). Веб берёт из него только окно сетки; приложению
   * нужны сами часы и перерывы колонок.
   */
  plans: Map<string, DayPlan>;
};

async function buildDayData(
  studioId: string,
  providerId: string,
  dateKey: string,
  timeZone: string,
): Promise<DayBuild> {
  const { start: dayStart, end: dayEnd } = salonDayBounds(dateKey, timeZone);

  const [masters, bookings, blocks] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: providerId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        studioPaused: true,
        ownerUserId: true,
        ratingAvg: true,
        ratingCount: true,
        // STUDIO-RESCHEDULE-VALIDATION-A: surface enabled MasterService
        // ids so the move dialog can gate the master picker. Disabled
        // rows are excluded — same predicate the backend uses for
        // `assertMasterPerformsService`.
        masterServices: {
          where: { isEnabled: true },
          select: { serviceId: true },
        },
        // STUDIO-MASTER-PROFILES (этап 4): другие профили того же человека —
        // его личная занятость рисуется в колонке профиля в студии.
        owner: { select: { providers: { where: { type: ProviderType.MASTER }, select: { id: true } } } },
      },
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
        startAtUtc: { gte: dayStart, lt: dayEnd },
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
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
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

  // Per-master first-time-client detection — a single grouped query
  // gives every client's earliest booking in the studio; the booking
  // on the current day is "new" if its id matches the earliest.
  // STUDIO-MASTER-OWN-BOOKINGS-01: личная запись мастера — не запись студии.
  // Та же развилка, что у права на управление (`auth/ownership.ts`): студия
  // управляет записью её поверхности (`studioId` либо её `providerId`).
  const isPersonalBooking = (b: { studioId: string | null; providerId: string }) =>
    !isStudioSurfaceBooking(b, studioId);

  const clientKeys = bookings
    .filter((booking) => !isPersonalBooking(booking))
    .map((booking) => booking.clientUserId)
    .filter((value): value is string => Boolean(value));
  const earliestByClient = new Map<string, string>();
  if (clientKeys.length > 0) {
    const earliest = await prisma.booking.findMany({
      where: {
        ...studioBookingsWhere(studioId),
        clientUserId: { in: clientKeys },
      },
      orderBy: { startAtUtc: "asc" },
      select: { id: true, clientUserId: true },
    });
    for (const row of earliest) {
      if (!row.clientUserId) continue;
      if (!earliestByClient.has(row.clientUserId)) {
        earliestByClient.set(row.clientUserId, row.id);
      }
    }
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

  // BOOKING-FLOW-AUDIT-RESIDUALS: сетка дня раздвигается под часы активных
  // мастеров, записи и перерывы этого дня (минимум — 09–21). Интервал через
  // полночь салона прижимается к краю суток.
  const minuteOfSalonDay = (instant: Date): number => {
    if (instant.getTime() <= dayStart.getTime()) return 0;
    if (instant.getTime() >= dayEnd.getTime()) return 24 * 60;
    return salonMinuteOfDay(instant, timeZone);
  };
  // SCHEDULE-PATTERNS-01: часы мастеров — из движка одним пакетом (раньше —
  // по два запроса на мастера мимо «Особых дней»). День с фиксированным
  // временем хранится как 00:00–23:55; сетке нужны выбранные начала, а не сутки.
  const dayPlans = await loadDayPlans({
    providerIds: masters.filter((master) => isStudioMasterActive(master)).map((master) => master.id),
    fromKey: dateKey,
    toKeyExclusive: addDaysToDateKey(dateKey, 1),
  });
  const gridMinutes: number[] = [];
  for (const plans of dayPlans.values()) {
    const plan = plans.get(dateKey);
    if (!plan?.isWorking) continue;
    if (plan.fixedStarts) {
      const starts = plan.fixedStarts
        .map((value) => timeToMinutes(value))
        .filter((value): value is number => value !== null);
      if (starts.length === 0) continue;
      gridMinutes.push(Math.min(...starts), Math.min(24 * 60, Math.max(...starts) + 60));
      continue;
    }
    const hours = dayPlanHours(plan);
    const start = hours.start ? timeToMinutes(hours.start) : null;
    const end = hours.end ? timeToMinutes(hours.end) : null;
    if (start === null || end === null) continue;
    gridMinutes.push(start, end);
  }
  for (const cell of [...bookingCells, ...breakCells]) {
    gridMinutes.push(
      minuteOfSalonDay(new Date(cell.startAtUtc)),
      minuteOfSalonDay(new Date(cell.endAtUtc)),
    );
  }

  const plans = new Map<string, DayPlan>();
  for (const [masterId, byDate] of dayPlans) {
    const plan = byDate.get(dateKey);
    if (plan) plans.set(masterId, plan);
  }

  return {
    day: {
      dateKey,
      dayStartIso: dayStart.toISOString(),
      gridWindow: resolveGridWindow(gridMinutes),
      columns,
      bookings: bookingCells,
      breaks: breakCells,
    },
    plans,
  };
}

function computeKpis(day: ScheduleDayData): ScheduleKpis {
  // Записи и выручка — студийные; личные записи мастеров занимают время
  // (загрузка и свободные окошки их учитывают), но записями студии не являются.
  const studioBookings = day.bookings.filter((b) => !b.isPersonal);
  const completed = studioBookings.filter(
    (b) =>
      b.status === BookingStatus.CONFIRMED ||
      b.status === BookingStatus.PREPAID ||
      b.status === BookingStatus.STARTED ||
      b.status === BookingStatus.IN_PROGRESS ||
      b.status === BookingStatus.FINISHED,
  );
  const confirmedCount = completed.length;
  const totalCount = studioBookings.length;
  const occupiedCount = day.bookings.length;
  const revenue = studioBookings.reduce(
    (sum, b) => sum + b.priceKopeks,
    0,
  );

  const onShift = day.columns.filter((column) => column.isAvailable);
  const occupancyDenominator = onShift.length * DAILY_CAPACITY;
  const occupancy =
    occupancyDenominator > 0
      ? Math.min(Math.round((occupiedCount / occupancyDenominator) * 100), 100)
      : 0;

  return {
    bookingsCount: totalCount,
    bookingsConfirmedCount: confirmedCount,
    revenueKopeks: revenue,
    occupancyPercent: occupancy,
    occupancyHoursDenominator: occupancyDenominator,
    mastersOnShift: onShift.length,
    freeWindowsCount: Math.max(occupancyDenominator - occupiedCount, 0),
  };
}

const WEEKDAY_SHORT_RU = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const;

async function buildWeekData(
  studioId: string,
  providerId: string,
  dateKey: string,
  // EXP-020: "today" resolved in the STUDIO's own tz (YYYY-MM-DD), not the UTC
  // calendar day — so the highlighted column matches the master/client cabinets
  // (which all key "today" off `toLocalDateKey(now, entityTz)`).
  studioTodayKey: string,
  timeZone: string,
): Promise<ScheduleWeekData> {
  // Неделя — календарная арифметика над ключами дат, границы — в поясе салона.
  const weekStartKey = toDateKey(startOfUtcWeekMonday(parseDateKey(dateKey)));
  const weekStart = salonDayBounds(weekStartKey, timeZone).start;
  const weekEnd = salonDayBounds(addDaysToDateKey(weekStartKey, 6), timeZone).end;

  const [masters, bookings] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: providerId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        studioPaused: true,
        ownerUserId: true,
        ratingAvg: true,
        ratingCount: true,
        masterServices: {
          where: { isEnabled: true },
          select: { serviceId: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        ...studioBookingsWhere(studioId),
        startAtUtc: { gte: weekStart, lt: weekEnd },
        status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
      },
      select: {
        masterProviderId: true,
        providerId: true,
        startAtUtc: true,
      },
    }),
  ]);

  const days: ScheduleWeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const key = addDaysToDateKey(weekStartKey, index);
    return {
      dateKey: key,
      weekdayLabel: WEEKDAY_SHORT_RU[index],
      dayNumber: Number(key.slice(8, 10)),
      isToday: key === studioTodayKey,
    };
  });
  const weekDayKeys = new Set(days.map((day) => day.dateKey));

  const countsByMasterAndDay = new Map<string, Map<string, number>>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    // День записи — по салону (rule 17), а не смещение в UTC-сутках.
    const dayKey = toLocalDateKey(booking.startAtUtc, timeZone);
    if (!weekDayKeys.has(dayKey)) continue;
    const masterId = booking.masterProviderId ?? booking.providerId;
    const byDay = countsByMasterAndDay.get(masterId) ?? new Map<string, number>();
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
    countsByMasterAndDay.set(masterId, byDay);
  }

  // STUDIO-BUGS-FIX-A bug #5: INVITED masters get zero capacity + isDayOff
  // across the whole week. They surface in the grid so admin sees they
  // exist, but with no schedulable hours.
  const rows: ScheduleWeekRow[] = masters.map((master) => {
    const active = isStudioMasterActive(master);
    const byDay = countsByMasterAndDay.get(master.id) ?? new Map();
    return {
      master: {
        id: master.id,
        name: master.name,
        avatarUrl: master.avatarUrl ?? null,
        rating: master.ratingAvg ?? 0,
        reviewsCount: master.ratingCount ?? 0,
        isAvailable: active,
        serviceIds: master.masterServices.map((row) => row.serviceId),
      },
      cells: days.map((day) => {
        const booked = byDay.get(day.dateKey) ?? 0;
        const capacity = active ? DAILY_CAPACITY : 0;
        const percent =
          capacity > 0 ? Math.min(Math.round((booked / capacity) * 100), 100) : 0;
        return {
          dateKey: day.dateKey,
          booked,
          capacity,
          percent,
          isDayOff: !active,
        };
      }),
    };
  });

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
}): Promise<StudioScheduleData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true, provider: { select: { timezone: true } } },
  });
  if (!studio) {
    throw new Error(`Studio not found: ${input.studioId}`);
  }

  const studioTimezone = studio.provider.timezone;
  const studioTodayKey = toLocalDateKey(new Date(), studioTimezone);
  const effectiveDateKey = input.dateKey ?? studioTodayKey;

  const [{ day }, services, week] = await Promise.all([
    buildDayData(studio.id, studio.providerId, effectiveDateKey, studioTimezone),
    loadServices(studio.id, studio.providerId),
    input.view === "week"
      ? buildWeekData(studio.id, studio.providerId, effectiveDateKey, studioTodayKey, studioTimezone)
      : Promise.resolve(null),
  ]);

  return {
    dateKey: effectiveDateKey,
    view: input.view,
    timezone: studioTimezone,
    day,
    kpis: computeKpis(day),
    week,
    services,
  };
}

/**
 * MOBILE-STUDIO-C (ops) — день календаря студии для приложения: та же сборка
 * дня, что у веба (`buildDayData` + `computeKpis`), плюс план дня каждого
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

  const timezone = studio.provider.timezone;
  const todayKey = toLocalDateKey(input.now ?? new Date(), timezone);
  const { day, plans } = await buildDayData(studio.id, studio.providerId, input.dateKey ?? todayKey, timezone);
  return { studioId: studio.id, timezone, todayKey, day, kpis: computeKpis(day), plans };
}

void DAY_START_HOUR;
void DAY_END_HOUR;

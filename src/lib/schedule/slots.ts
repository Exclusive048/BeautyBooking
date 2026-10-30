import type { AvailabilitySlot } from "@/lib/domain/schedule";
import { addMinutes, minutesToTime, timeToMinutes } from "@/lib/schedule/time";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { getLocalTimeParts, toLocalDateKey, toUtcFromLocalDateTime } from "@/lib/schedule/timezone";
import type { DayPlan } from "@/lib/schedule/types";

type BookingRange = {
  startAtUtc: Date;
  endAtUtc: Date;
};

type BuildSlotsInput = {
  dayPlan: DayPlan;
  dateKey: string;
  timeZone: string;
  serviceDurationMin: number;
  bufferMin: number;
  bookings: BookingRange[];
  /**
   * FIX-TIMEBLOCK-ENFORCEMENT-01: studio/master `TimeBlock` windows (UTC
   * instants) that must be removed from availability. A HARD window — no buffer
   * is applied (mirrors `dayPlan.breaks`); a booking may abut a block. Optional
   * (defaults to none) so pure callers/tests that pass no blocks are unchanged.
   */
  blocks?: BookingRange[];
  now: Date;
  /**
   * Grid granularity in minutes (the master's saved `slotStepMin`, e.g. 15/30/60).
   * FIX-05 (QA-111): previously hardcoded to 30 — the master's setting was inert.
   * Falls back to 30 only when a caller omits it (callers pass the normalized value).
   */
  slotStepMin?: number;
  /**
   * SLOTS-FLUSH-STARTS (2026-10-29): начала, которых нет ни в сетке, ни среди
   * «впритык» этого дня, но которые нужно проверить, — курсор визарда пакета
   * (конец предыдущей, ещё не записанной услуги + пауза мастера) и время,
   * которое проверяет запись (`resolveBookingCore`). Проходят те же проверки,
   * что и остальные начала; моменты других дат и день «Фиксированное время» их
   * не берут.
   */
  extraStartsUtc?: Date[];
  /**
   * SLOTS-GAP-PACKING (2026-10-30, решение владельца): длительности услуг,
   * которые профиль продаёт, — чем ещё можно заполнить свободный промежуток.
   * Задано — день не предлагает начала, которые оставляют в нём дыру, не
   * заполнимую никакой комбинацией этих услуг (`isPackingStart`), а к
   * кандидатам добавляются начала «подряд» этой услуги. Не задано — кандидаты
   * без отбора: пробы «свободно сегодня», фильтра «когда» и ближайшего окошка
   * профиля.
   */
  packingDurationsMin?: number[];
  /**
   * MANUAL-SLOTS-ALL (2026-10-30, решение владельца): начала «подряд» без
   * отбора — «все свободные времена» ручной записи. Оператор видит их поверх
   * окошек клиента, поэтому набор обязан включать и то, что клиенту
   * предлагает отбор (6:50 после записи 6:10–6:30), а не только сетку.
   */
  chainStarts?: boolean;
};

type BlockInterval = { start: number; end: number };

const BOOKING_MERGE_THRESHOLD = 10;

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function buildBlockIntervals(breaks: Array<{ start: string; end: string }>): BlockInterval[] {
  return breaks
    .map((item) => {
      const start = timeToMinutes(item.start);
      const end = timeToMinutes(item.end);
      if (start === null || end === null || start >= end) return null;
      return { start, end };
    })
    .filter((item): item is BlockInterval => item !== null);
}

function mergeIntervals(intervals: BlockInterval[]): BlockInterval[] {
  if (intervals.length <= 1) return intervals;
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const merged: BlockInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
      continue;
    }
    last.end = Math.max(last.end, interval.end);
  }
  return merged;
}

/** Начала окошек по сетке шага внутри рабочего отрезка (обычный день). */
function buildGridStarts(input: {
  windowStart: number;
  windowEnd: number;
  stepMin: number;
  earliest: number;
  durationMin: number;
}): number[] {
  const start = Math.max(roundUpToStep(input.windowStart, input.stepMin), input.earliest);
  const end = roundDownToStep(input.windowEnd, input.stepMin);
  const starts: number[] = [];
  for (let t = start; t + input.durationMin <= end; t += input.stepMin) {
    starts.push(t);
  }
  return starts;
}

/**
 * SLOTS-FLUSH-STARTS (2026-10-29, запрос мастера) — начала «впритык». Сетка
 * шага одна теряла время у занятого: услуга 20 минут при шаге 15, запись на
 * 7:00 — следующее окошко 7:30, и три записи подряд занимали час двадцать
 * вместо часа. Поэтому к сетке добавляются начала сразу ПОСЛЕ занятого (конец
 * записи + пауза, конец перерыва и блокировки, начало рабочего отрезка) и
 * вплотную ДО него (так, чтобы услуга кончилась ровно к началу записи с учётом
 * паузы, к перерыву или к концу рабочего отрезка). На пустом отрезке остаётся
 * сетка — лишних времён там нет. Проверки начала (перерывы, блокировки, записи)
 * не меняются: это только кандидаты.
 */
function buildFlushStarts(input: {
  windowStart: number;
  windowEnd: number;
  durationMin: number;
  busy: BlockInterval[];
}): number[] {
  const starts = [input.windowStart, input.windowEnd - input.durationMin];
  for (const item of input.busy) {
    starts.push(item.end, item.start - input.durationMin);
  }
  return starts;
}

/**
 * SLOTS-GAP-PACKING — начала «подряд»: от начала рабочего отрезка и от конца
 * каждого занятого куска — запись за записью этой услуги с паузой мастера, до
 * следующего занятого. Без них после записи 6:10–6:30 (20 минут, шаг 15) были
 * только 6:30 и сетка 6:45, 7:00: клиент, которому удобно около 6:50, брал 6:45
 * и оставлял 15 минут, куда не помещается ни одна услуга.
 */
function buildChainStarts(input: {
  windowStart: number;
  windowEnd: number;
  durationMin: number;
  bufferMin: number;
  busy: BlockInterval[];
}): number[] {
  const step = input.durationMin + input.bufferMin;
  const starts: number[] = [];
  const anchors = [input.windowStart, ...input.busy.map((item) => item.end)];
  for (const anchor of anchors) {
    if (anchor < input.windowStart || anchor >= input.windowEnd) continue;
    // `busy` слит и отсортирован: первый кусок, начинающийся после якоря, — граница цепочки.
    const nextBusy = input.busy.find((item) => item.start >= anchor);
    const limit = Math.min(input.windowEnd, nextBusy ? nextBusy.start : input.windowEnd);
    for (let t = anchor + step; t + input.durationMin <= limit; t += step) {
      starts.push(t);
    }
  }
  return starts;
}

/**
 * SLOTS-GAP-PACKING — сколько минут промежутка заполнят услуги профиля.
 * `best[c]` — наибольшая сумма весов не больше `c`, вес услуги — длительность
 * плюс пауза мастера (пауза стоит между соседними записями). Неограниченный
 * рюкзак по минутам суток: несколько тысяч операций на день.
 */
function buildPackingTable(durations: number[], bufferMin: number, capacity: number): Int32Array {
  const weights = Array.from(new Set(durations))
    .filter((value) => Number.isInteger(value) && value > 0)
    .map((value) => value + bufferMin);
  const reachable = new Uint8Array(capacity + 1);
  reachable[0] = 1;
  for (let c = 1; c <= capacity; c += 1) {
    for (const weight of weights) {
      if (weight <= c && reachable[c - weight]) {
        reachable[c] = 1;
        break;
      }
    }
  }
  const best = new Int32Array(capacity + 1);
  for (let c = 1; c <= capacity; c += 1) {
    best[c] = reachable[c] ? c : best[c - 1];
  }
  return best;
}

/**
 * SLOTS-GAP-PACKING (2026-10-30, решение владельца) — не оставляет ли начало
 * дыру, которую потом нечем заполнить. Свободный отрезок, где стоит начало,
 * ограничен занятым (запись с паузой, перерыв, блокировка) или краем рабочего
 * отрезка. Начало годится, если:
 *   1. ДО него не остаётся минут, которые не заполнить услугами профиля, —
 *      неизбежный остаток отрезка уходит к его концу, а не дырой к записи;
 *   2. до и после него вместе пропадает не больше минут, чем пропадает в этом
 *      отрезке при лучшей раскладке без него.
 * Пример: запись 6:10–6:30, услуги по 20 минут — 6:45 не предлагается (6:30–6:45
 * не заполнить), 6:50 предлагается. Простое «не оставлять промежуток короче
 * самой короткой услуги» хуже прежнего: оно не даёт поставить 20 минут в
 * промежуток 25 (симуляция плотного дня: −2…−18% записей против прежней
 * выдачи; это правило в том же прогоне даёт +5…+13%, а при сетке шагом во всю
 * длительность услуги — без изменений).
 *
 * Сегодня левый край — «сейчас», если оно позже занятого: время до «сейчас» не
 * продать всё равно, и проверяется только то, что остаётся ПОСЛЕ начала.
 * Вес услуги — длительность плюс пауза; ёмкость отрезка без начала — его длина
 * плюс пауза (паузы стоят только МЕЖДУ записями).
 */
function isPackingStart(input: {
  start: number;
  durationMin: number;
  bufferMin: number;
  windowStart: number;
  windowEnd: number;
  earliest: number;
  busy: BlockInterval[];
  best: Int32Array;
}): boolean {
  const waste = (capacity: number): number => {
    if (capacity <= 0) return 0;
    const clamped = Math.min(capacity, input.best.length - 1);
    return capacity - input.best[clamped];
  };

  let prev = input.windowStart;
  let next = input.windowEnd;
  for (const item of input.busy) {
    if (item.end <= input.start && item.end > prev) prev = item.end;
    if (item.start >= input.start + input.durationMin && item.start < next) next = item.start;
  }
  const after = next - (input.start + input.durationMin);

  if (input.earliest > prev) {
    return waste(after) <= waste(next - input.start + input.bufferMin);
  }

  const before = input.start - prev;
  if (waste(before) > 0) return false;
  return waste(before) + waste(after) <= waste(next - prev + input.bufferMin);
}

export function buildSlotsForDay(input: BuildSlotsInput): AvailabilitySlot[] {
  if (!input.dayPlan.isWorking) return [];
  if (input.dayPlan.workingIntervals.length === 0) return [];
  if (!Number.isInteger(input.serviceDurationMin) || input.serviceDurationMin <= 0) return [];

  const nowLocalKey = toLocalDateKey(input.now, input.timeZone);
  const nowParts = getLocalTimeParts(input.now, input.timeZone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;

  const stepMin = input.slotStepMin ?? 30;
  const slots: AvailabilitySlot[] = [];
  const blockIntervals = buildBlockIntervals(input.dayPlan.breaks);
  const dateForLocal = dateFromLocalDateKey(input.dateKey, input.timeZone);
  const nextDateKey = addDaysToDateKey(input.dateKey, 1);
  const nextDateForLocal = dateFromLocalDateKey(nextDateKey, input.timeZone);
  const dayStartUtc = toUtcFromLocalDateTime(dateForLocal, 0, 0, input.timeZone);
  const dayEndUtc = toUtcFromLocalDateTime(nextDateForLocal, 0, 0, input.timeZone);

  // Отрезок в минутах местного дня салона, обрезанный по границам суток.
  const toDayMinutes = (startUtc: Date, endUtc: Date): BlockInterval | null => {
    if (endUtc <= dayStartUtc || startUtc >= dayEndUtc) return null;
    const startMinutes =
      startUtc <= dayStartUtc
        ? 0
        : (() => {
            const parts = getLocalTimeParts(startUtc, input.timeZone);
            return parts.hour * 60 + parts.minute;
          })();
    const endMinutes =
      endUtc >= dayEndUtc
        ? 24 * 60
        : (() => {
            const parts = getLocalTimeParts(endUtc, input.timeZone);
            return parts.hour * 60 + parts.minute;
          })();
    if (startMinutes >= endMinutes) return null;
    return { start: startMinutes, end: endMinutes };
  };

  const bookingIntervals = input.bookings
    .map((booking) =>
      toDayMinutes(
        input.bufferMin ? addMinutes(booking.startAtUtc, -input.bufferMin) : booking.startAtUtc,
        input.bufferMin ? addMinutes(booking.endAtUtc, input.bufferMin) : booking.endAtUtc,
      ),
    )
    .filter((item): item is BlockInterval => item !== null);

  const useMergedBookings = input.bookings.length > BOOKING_MERGE_THRESHOLD;
  const mergedBookings = useMergedBookings ? mergeIntervals(bookingIntervals) : null;

  // SCHEDULE-PATTERNS-01 (этап 1): у дня «Фиксированное время» кандидаты —
  // ровно выбранные мастером начала, а не сетка шага. Раньше движок строил
  // сетку по дню 00:00–23:55 и выбранные времена отсекал только фильтр
  // `bookable-window.ts`: время не по сетке (10:15 при шаге 30) не предлагалось
  // никогда, а ядро записи и остальные потребители видели всю сетку.
  const fixedStarts = input.dayPlan.fixedStarts
    ? input.dayPlan.fixedStarts
        .map((value) => timeToMinutes(value))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)
    : null;

  // Занятое время дня одним списком — от него считаются начала «впритык».
  // Касающиеся отрезки сливаются: конец записи, за которой сразу перерыв, не
  // начало.
  const busyIntervals = fixedStarts
    ? []
    : mergeIntervals([
        ...bookingIntervals,
        ...blockIntervals,
        ...(input.blocks ?? [])
          .map((block) => toDayMinutes(block.startAtUtc, block.endAtUtc))
          .filter((item): item is BlockInterval => item !== null),
      ]);

  const extraStarts = fixedStarts
    ? []
    : (input.extraStartsUtc ?? [])
        .filter((value) => toLocalDateKey(value, input.timeZone) === input.dateKey)
        .map((value) => {
          const parts = getLocalTimeParts(value, input.timeZone);
          return parts.hour * 60 + parts.minute;
        });
  // SLOTS-GAP-PACKING: переданные начала отбор не проходят — это курсор пакета
  // (следующая услуга встанет вплотную к предыдущей, которой ещё нет в записях)
  // и время, которое проверяет запись, уже показанное клиенту.
  const exemptStarts = new Set(extraStarts);
  const packingTable =
    !fixedStarts && input.packingDurationsMin
      ? buildPackingTable(
          [...input.packingDurationsMin, input.serviceDurationMin],
          input.bufferMin,
          24 * 60 + input.bufferMin,
        )
      : null;

  for (const interval of input.dayPlan.workingIntervals) {
    const windowStart = timeToMinutes(interval.start);
    const windowEnd = timeToMinutes(interval.end);
    if (windowStart === null || windowEnd === null || windowStart >= windowEnd) continue;

    if (input.dateKey < nowLocalKey) continue;
    const earliest = input.dateKey === nowLocalKey ? nowMinutes : 0;

    const candidates = fixedStarts
      ? fixedStarts.filter(
          (t) => t >= windowStart && t >= earliest && t + input.serviceDurationMin <= windowEnd,
        )
      : Array.from(
          new Set([
            ...buildGridStarts({
              windowStart,
              windowEnd,
              stepMin,
              earliest: input.dateKey === nowLocalKey ? roundUpToStep(nowMinutes, stepMin) : 0,
              durationMin: input.serviceDurationMin,
            }),
            ...[
              ...buildFlushStarts({
                windowStart,
                windowEnd,
                durationMin: input.serviceDurationMin,
                busy: busyIntervals,
              }),
              ...(packingTable || input.chainStarts
                ? buildChainStarts({
                    windowStart,
                    windowEnd,
                    durationMin: input.serviceDurationMin,
                    bufferMin: input.bufferMin,
                    busy: busyIntervals,
                  })
                : []),
              ...extraStarts,
            ].filter(
              (t) => t >= windowStart && t >= earliest && t + input.serviceDurationMin <= windowEnd,
            ),
          ]),
        ).sort((a, b) => a - b);

    let bookingCursor = 0;
    for (const t of candidates) {
      const blocked = blockIntervals.some((b) => t < b.end && t + input.serviceDurationMin > b.start);
      if (blocked) continue;

      const startUtc = toUtcFromLocalDateTime(dateForLocal, Math.floor(t / 60), t % 60, input.timeZone);
      const endUtc = addMinutes(startUtc, input.serviceDurationMin);

      // FIX-TIMEBLOCK-ENFORCEMENT-01: a slot overlapping a TimeBlock window is
      // not offered. Instant-based UTC overlap (no buffer — hard window), the
      // same overlap shape used for bookings just below.
      const blockedByTimeBlock = input.blocks?.some(
        (block) => startUtc < block.endAtUtc && endUtc > block.startAtUtc,
      );
      if (blockedByTimeBlock) continue;

      const hasConflict = mergedBookings
        ? (() => {
            while (bookingCursor < mergedBookings.length && mergedBookings[bookingCursor].end <= t) {
              bookingCursor += 1;
            }
            const interval = mergedBookings[bookingCursor];
            return interval ? t < interval.end && t + input.serviceDurationMin > interval.start : false;
          })()
        : input.bookings.some((booking) => {
            const bufferedStart = input.bufferMin
              ? addMinutes(booking.startAtUtc, -input.bufferMin)
              : booking.startAtUtc;
            const bufferedEnd = input.bufferMin
              ? addMinutes(booking.endAtUtc, input.bufferMin)
              : booking.endAtUtc;
            return startUtc < bufferedEnd && endUtc > bufferedStart;
          });
      if (hasConflict) continue;

      if (
        packingTable &&
        !exemptStarts.has(t) &&
        !isPackingStart({
          start: t,
          durationMin: input.serviceDurationMin,
          bufferMin: input.bufferMin,
          windowStart,
          windowEnd,
          earliest,
          busy: busyIntervals,
          best: packingTable,
        })
      ) {
        continue;
      }

      slots.push({
        startAtUtc: startUtc,
        endAtUtc: endUtc,
        label: `${input.dateKey} ${minutesToTime(t)}`,
      });
    }
  }

  return slots;
}

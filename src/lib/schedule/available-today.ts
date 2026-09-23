import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AvailabilitySlot } from "@/lib/domain/schedule";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { addDaysToDateKey, localDayRangeUtc } from "@/lib/schedule/dateKey";
import { buildBookingOverlapWhere } from "@/lib/schedule/overlap";
import { loadTimeBlockRanges } from "@/lib/schedule/time-blocks";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { normalizeSlotStepMin } from "@/lib/schedule/editor-shared";
import { normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { earliestBookableUtc } from "@/lib/bookings/policy-enforcement";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";

/**
 * CATALOG-AVAILABLE-TODAY — Phase 1: the pure `hasFreeSlotToday` probe.
 *
 * Answers "does this provider have ≥1 free BOOKABLE slot TODAY (salon-tz)?"
 * — the boolean the catalog `availableToday` filter/chip/studio-badge need.
 *
 * 🔴 SERVER-ONLY (rule 13): imports `ScheduleEngine` + Prisma. Never
 * client-importable. Nothing consumes this yet — Phase 2 wires the sweep +
 * DB write, Phase 3 schedules it. This phase is the proven helper only.
 *
 * 🔴 ENGINE-SAFETY — this is a NEW CONSUMER, not an engine change. It uses
 * the PURE read path — `ScheduleEngine.getDayPlanFromContext` (a benign
 * DayPlan memo, same key the booking flow uses) + the pure `buildSlotsForDay`
 * — and COUNTS the output. It deliberately does NOT call
 * `listAvailabilitySlotsPaginated` / `setCachedSlotsForDate` (those write the
 * SLOTS cache). It NEVER mutates slot-gen, so the slot-gen output (and its
 * TZ=UTC≡Europe/Moscow SHA) is byte-identical. Booking reads are fresh, so
 * the boolean reflects current bookings without depending on the slot cache.
 *
 * Mirrors the proven `computeAvailabilityHint`
 * (`public-profile-view.service.ts`) — same context → fresh bookings →
 * getDayPlanFromContext → buildSlotsForDay(30-min probe) → earliest-bookable
 * cutoff. Service-agnostic (a 30-min probe duration; no serviceId needed).
 */

/** The service-agnostic probe duration — "is there room for a typical slot". */
export const AVAILABILITY_PROBE_DURATION_MIN = 30;

/** Probe input — the schedule-relevant fields of a single (master) provider. */
export type AvailabilityProbeProvider = {
  id: string;
  timezone: string;
  slotStepMin: number | null;
  minBookingHoursAhead: number | null;
  bufferBetweenBookingsMin: number | null;
};

/**
 * PURE: does any slot start at/after the earliest-bookable cutoff?
 * `>=` is inclusive — a slot exactly at the cutoff is bookable (matches
 * `assertBookingWindow` / `listBookableSlots` semantics).
 */
export function anyBookableSlot(
  slots: ReadonlyArray<Pick<AvailabilitySlot, "startAtUtc">>,
  earliestBookable: Date,
): boolean {
  const cutoff = earliestBookable.getTime();
  return slots.some((slot) => slot.startAtUtc.getTime() >= cutoff);
}

/**
 * PURE control-flow: is ANY provider free today? Short-circuits on the first
 * free one (the studio OR-aggregation — studio is free-today iff any active
 * master is). The probe is dependency-injected so this is unit-testable
 * without the DB/engine.
 */
export async function anyProviderFreeToday(
  providers: ReadonlyArray<AvailabilityProbeProvider>,
  now: Date,
  probe: (provider: AvailabilityProbeProvider, now: Date) => Promise<boolean>,
): Promise<boolean> {
  for (const provider of providers) {
    if (await probe(provider, now)) return true;
  }
  return false;
}

/**
 * Single-provider probe (a MASTER, or one of a studio's masters): true iff
 * the provider has ≥1 free bookable slot TODAY in its OWN (salon) timezone.
 * Pure read path — no slots-cache write, no `listAvailabilitySlotsPaginated`.
 */
export async function providerHasFreeSlotToday(
  provider: AvailabilityProbeProvider,
  now: Date,
): Promise<boolean> {
  const timezone = provider.timezone;
  // 'Today' is salon-local — a +5 studio's "today" window is NOT UTC midnight.
  const todayKey = toLocalDateKey(now, timezone);
  const toKeyExclusive = addDaysToDateKey(todayKey, 1);

  const ctx = await createScheduleContext({
    providerId: provider.id,
    timezoneHint: timezone,
    range: { fromKey: todayKey, toKeyExclusive },
  });
  const plan = await ScheduleEngine.getDayPlanFromContext(ctx, todayKey);
  if (!plan.isWorking) return false;

  const earliestBookable = earliestBookableUtc(
    { minBookingHoursAhead: Math.max(0, provider.minBookingHoursAhead ?? 0) },
    now,
  );

  // FIX-8 (HARDENING-04): the conflict set is bookings that OVERLAP the
  // salon-local day, NOT `startAtUtc >= now`. The old filter dropped
  // in-progress bookings (started before `now`, still running) and
  // cross-midnight bookings (started the previous salon evening) → a slot
  // sitting under an ongoing appointment counted as free. Overlap semantics
  // (the same primitive the engine uses) include them. Fresh bookings (not the
  // slots cache) → the boolean is booking-accurate. The slot HORIZON is
  // unchanged — `anyBookableSlot` still only counts slots ≥ earliest-bookable.
  const { startUtc: dayStartUtc, endExclusiveUtc: dayEndUtc } = localDayRangeUtc(
    todayKey,
    timezone,
  );
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { masterProviderId: provider.id },
        { masterProviderId: null, providerId: provider.id },
      ],
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      ...buildBookingOverlapWhere(dayStartUtc, dayEndUtc),
    },
    select: { startAtUtc: true, endAtUtc: true },
  });
  const todayBookings = bookings
    .filter(
      (booking): booking is { startAtUtc: Date; endAtUtc: Date } =>
        booking.startAtUtc !== null && booking.endAtUtc !== null,
    )
    .map((booking) => ({ startAtUtc: booking.startAtUtc, endAtUtc: booking.endAtUtc }));

  // FIX-TIMEBLOCK-ENFORCEMENT-01: a fully-blocked master must not show as
  // "available today" — feed the same TimeBlock windows the booking flow honours.
  const todayBlocks = await loadTimeBlockRanges(provider.id, dayStartUtc, dayEndUtc);

  const slots = buildSlotsForDay({
    dayPlan: plan,
    dateKey: todayKey,
    timeZone: timezone,
    serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
    bufferMin: normalizeBufferMinutes(provider.bufferBetweenBookingsMin),
    bookings: todayBookings,
    blocks: todayBlocks,
    now,
    slotStepMin: normalizeSlotStepMin(provider.slotStepMin),
  });

  return anyBookableSlot(slots, earliestBookable);
}

const PROBE_SELECT = {
  id: true,
  timezone: true,
  slotStepMin: true,
  minBookingHoursAhead: true,
  bufferBetweenBookingsMin: true,
} as const;

/**
 * Public entry: true iff the provider has ≥1 free bookable slot today.
 *  - MASTER → single-provider probe.
 *  - STUDIO → OR over its ACTIVE masters (invariant #24: `ownerUserId != null`
 *    && !`studioPaused`) — free-today if ANY active master is free (short-circuit).
 *
 * No DB write, no caller yet — Phase 2 wires the recompute sweep.
 */
export async function hasFreeSlotToday(
  providerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { ...PROBE_SELECT, type: true },
  });
  if (!provider) return false;

  if (provider.type === ProviderType.MASTER) {
    return providerHasFreeSlotToday(provider, now);
  }

  // STUDIO — the studio Provider row has no bookable schedule of its own;
  // availability is the union of its active masters' availability.
  const masters = await prisma.provider.findMany({
    where: {
      type: ProviderType.MASTER,
      studioId: provider.id,
      // isStudioMasterActive (STUDIO-BUGS-FIX-A / invariant #24), expressed as WHERE.
      ...STUDIO_ACTIVE_MASTER_WHERE,
    },
    select: PROBE_SELECT,
  });

  return anyProviderFreeToday(masters, now, providerHasFreeSlotToday);
}

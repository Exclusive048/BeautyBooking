import { describe, expect, it, vi } from "vitest";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import { earliestBookableUtc } from "@/lib/bookings/policy-enforcement";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { DayPlan } from "@/lib/schedule/types";
import {
  AVAILABILITY_PROBE_DURATION_MIN,
  anyBookableSlot,
  anyProviderFreeToday,
  type AvailabilityProbeProvider,
} from "@/lib/schedule/available-today";

// A working day 10:00–19:00 (salon-local), no breaks.
const WORKING_DAY: DayPlan = {
  isWorking: true,
  workingIntervals: [{ start: "10:00", end: "19:00" }],
  breaks: [],
  meta: { source: "weekly-template" },
};

const DAY_OFF: DayPlan = {
  isWorking: false,
  workingIntervals: [],
  breaks: [],
  meta: { source: "override" },
};

function slotAt(iso: string) {
  return { startAtUtc: new Date(iso) };
}

describe("anyBookableSlot (pure counting core)", () => {
  const cutoff = new Date("2026-07-02T15:00:00.000Z");

  it("true when a slot starts after the earliest-bookable cutoff", () => {
    expect(anyBookableSlot([slotAt("2026-07-02T16:00:00Z")], cutoff)).toBe(true);
  });

  it("false when every slot starts before the cutoff", () => {
    expect(
      anyBookableSlot([slotAt("2026-07-02T10:00:00Z"), slotAt("2026-07-02T14:30:00Z")], cutoff),
    ).toBe(false);
  });

  it("inclusive: a slot exactly at the cutoff counts", () => {
    expect(anyBookableSlot([slotAt("2026-07-02T15:00:00Z")], cutoff)).toBe(true);
  });

  it("false for an empty slot list (e.g. a day off)", () => {
    expect(anyBookableSlot([], cutoff)).toBe(false);
  });
});

describe("🔴 salon-tz 'today' bucketing (+5 Yekaterinburg)", () => {
  const TZ = "Asia/Yekaterinburg"; // UTC+5, no DST
  // 20:00 UTC = 01:00 next-day in +5 → salon-'today' is the NEXT calendar day.
  const now = new Date("2026-07-02T20:00:00.000Z");

  it("salon-'today' differs from UTC-'today' near midnight", () => {
    expect(toLocalDateKey(now, TZ)).toBe("2026-07-03");
    expect(toLocalDateKey(now, "UTC")).toBe("2026-07-02");
    // The classic bug: a UTC-midnight assumption would probe the wrong day.
    expect(toLocalDateKey(now, TZ)).not.toBe(toLocalDateKey(now, "UTC"));
  });

  it("slots generated for the salon-'today' bucket to that salon-local day", () => {
    const todayKey = toLocalDateKey(now, TZ); // 2026-07-03
    const slots = buildSlotsForDay({
      dayPlan: WORKING_DAY,
      dateKey: todayKey,
      timeZone: TZ,
      serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
      bufferMin: 0,
      bookings: [],
      now,
      slotStepMin: 30,
    });

    expect(slots.length).toBeGreaterThan(0);
    // Every slot's salon-local date is the salon-'today' — not the UTC day.
    for (const slot of slots) {
      expect(toLocalDateKey(slot.startAtUtc, TZ)).toBe(todayKey);
    }
    // The first 10:00 local slot is 05:00 UTC of the salon-local day.
    expect(slots[0].startAtUtc.toISOString()).toBe("2026-07-03T05:00:00.000Z");

    // With no min-ahead cutoff, this working salon-'today' is free.
    const earliest = earliestBookableUtc({ minBookingHoursAhead: 0 }, now);
    expect(anyBookableSlot(slots, earliest)).toBe(true);
  });
});

describe("earliest-bookable cutoff (min-booking-hours-ahead)", () => {
  const TZ = "UTC";
  const now = new Date("2026-07-02T09:00:00.000Z"); // 09:00, before the 10:00 open
  const todayKey = toLocalDateKey(now, TZ);

  function todaysSlots() {
    return buildSlotsForDay({
      dayPlan: WORKING_DAY,
      dateKey: todayKey,
      timeZone: TZ,
      serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
      bufferMin: 0,
      bookings: [],
      now,
      slotStepMin: 30,
    });
  }

  it("a slot earlier-today (before the cutoff) does NOT make it free; a later one does", () => {
    const slots = todaysSlots();
    // 6h ahead → cutoff 15:00; 15:00..18:30 slots remain → free.
    expect(anyBookableSlot(slots, earliestBookableUtc({ minBookingHoursAhead: 6 }, now))).toBe(true);
    // 11h ahead → cutoff 20:00, past the 19:00 close → no bookable slot → not free.
    expect(anyBookableSlot(slots, earliestBookableUtc({ minBookingHoursAhead: 11 }, now))).toBe(
      false,
    );
  });
});

describe("day-off / no schedule today", () => {
  it("a non-working DayPlan yields no slots → not free", () => {
    const now = new Date("2026-07-02T09:00:00.000Z");
    const slots = buildSlotsForDay({
      dayPlan: DAY_OFF,
      dateKey: toLocalDateKey(now, "UTC"),
      timeZone: "UTC",
      serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
      bufferMin: 0,
      bookings: [],
      now,
      slotStepMin: 30,
    });
    expect(slots).toHaveLength(0);
    expect(anyBookableSlot(slots, now)).toBe(false);
  });
});

describe("studio OR-aggregation (anyProviderFreeToday)", () => {
  const now = new Date("2026-07-02T09:00:00.000Z");
  const master = (id: string): AvailabilityProbeProvider => ({
    id,
    timezone: "UTC",
    slotStepMin: 30,
    minBookingHoursAhead: 2,
    bufferBetweenBookingsMin: 0,
  });

  it("no active masters → studio not free", async () => {
    const probe = vi.fn(async () => true);
    expect(await anyProviderFreeToday([], now, probe)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("all masters busy → studio not free (all probed)", async () => {
    const probe = vi.fn(async () => false);
    expect(await anyProviderFreeToday([master("a"), master("b")], now, probe)).toBe(false);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("any active master free → studio free", async () => {
    const probe = vi.fn(async (p: AvailabilityProbeProvider) => p.id === "b");
    expect(await anyProviderFreeToday([master("a"), master("b")], now, probe)).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("short-circuits on the first free master (does not probe the rest)", async () => {
    const probe = vi.fn(async () => true);
    expect(await anyProviderFreeToday([master("a"), master("b"), master("c")], now, probe)).toBe(
      true,
    );
    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe("service-agnostic probe", () => {
  it("uses a 30-min probe duration (no serviceId) to build slots", () => {
    expect(AVAILABILITY_PROBE_DURATION_MIN).toBe(30);
    const now = new Date("2026-07-02T06:00:00.000Z");
    const slots = buildSlotsForDay({
      dayPlan: WORKING_DAY,
      dateKey: toLocalDateKey(now, "UTC"),
      timeZone: "UTC",
      serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
      bufferMin: 0,
      bookings: [],
      now,
      slotStepMin: 30,
    });
    // 10:00..18:30 inclusive on a 30-min grid with a 30-min service = 18 slots.
    expect(slots.length).toBe(18);
  });
});

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
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import { bookingOverlapsRange } from "@/lib/schedule/overlap";

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

describe("🔴 FIX-8 salon-day conflict window", () => {
  const EKB = "Asia/Yekaterinburg"; // UTC+5, no DST — the non-Moscow anchor
  const MSK = "Europe/Moscow"; // UTC+3, no DST — the regression guard

  describe("localDayRangeUtc uses SALON-tz day boundaries (not naive UTC)", () => {
    it("Vision / Yekaterinburg (+5): salon-day starts 19:00Z the previous UTC day", () => {
      const { startUtc, endExclusiveUtc } = localDayRangeUtc("2026-07-07", EKB);
      expect(startUtc.toISOString()).toBe("2026-07-06T19:00:00.000Z");
      expect(endExclusiveUtc.toISOString()).toBe("2026-07-07T19:00:00.000Z");
    });

    it("Anna / Moscow (+3): salon-day starts 21:00Z the previous UTC day — NOT 00:00Z", () => {
      const { startUtc, endExclusiveUtc } = localDayRangeUtc("2026-07-07", MSK);
      expect(startUtc.toISOString()).toBe("2026-07-06T21:00:00.000Z");
      expect(endExclusiveUtc.toISOString()).toBe("2026-07-07T21:00:00.000Z");
      // A naive-UTC probe would use 2026-07-07T00:00Z — this is the bug the
      // salon-tz boundary prevents for any east-of-UTC salon.
      expect(startUtc.toISOString()).not.toBe("2026-07-07T00:00:00.000Z");
    });
  });

  describe("(a) in-progress booking across `now` — its slot is no longer free", () => {
    // Vision (+5): today 2026-07-07, working 10:00–19:00 EKB.
    // now = 13:30 EKB (08:30Z); an in-progress booking 13:00–14:00 EKB
    // (08:00Z–09:00Z) — it STARTED before `now`, so `startAtUtc >= now` dropped it.
    const now = new Date("2026-07-07T08:30:00.000Z"); // 13:30 EKB
    const inProgress = {
      startAtUtc: new Date("2026-07-07T08:00:00.000Z"), // 13:00 EKB
      endAtUtc: new Date("2026-07-07T09:00:00.000Z"), // 14:00 EKB
    };
    const todayKey = toLocalDateKey(now, EKB); // 2026-07-07
    const slotAt1330 = "2026-07-07T08:30:00.000Z";

    const slotsGiven = (bookings: Array<{ startAtUtc: Date; endAtUtc: Date }>) =>
      buildSlotsForDay({
        dayPlan: WORKING_DAY,
        dateKey: todayKey,
        timeZone: EKB,
        serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
        bufferMin: 0,
        bookings,
        now,
        slotStepMin: 30,
      });

    it("the OLD `startAtUtc >= now` filter dropped it; overlap keeps it", () => {
      expect(inProgress.startAtUtc.getTime() >= now.getTime()).toBe(false);
      const { startUtc, endExclusiveUtc } = localDayRangeUtc(todayKey, EKB);
      expect(bookingOverlapsRange(inProgress, startUtc, endExclusiveUtc)).toBe(true);
    });

    it("WITH the in-progress booking → the 13:30 slot is NOT offered", () => {
      const slots = slotsGiven([inProgress]);
      expect(slots.some((s) => s.startAtUtc.toISOString() === slotAt1330)).toBe(false);
    });

    it("WITHOUT it (old dropped-conflict behaviour) → the 13:30 slot WAS free (the bug)", () => {
      const slots = slotsGiven([]);
      expect(slots.some((s) => s.startAtUtc.toISOString() === slotAt1330)).toBe(true);
    });

    it("(c) horizon unchanged — later free slots today are still surfaced", () => {
      const slots = slotsGiven([inProgress]);
      const earliest = earliestBookableUtc({ minBookingHoursAhead: 0 }, now);
      // The master is still free LATER today (14:00 EKB onward), just not at 13:30.
      expect(anyBookableSlot(slots, earliest)).toBe(true);
      expect(slots.some((s) => s.startAtUtc.toISOString() === "2026-07-07T09:00:00.000Z")).toBe(true);
    });
  });

  describe("(b) cross-midnight booking (started previous salon-evening)", () => {
    // Vision (+5): booking 23:30 EKB Jul 6 → 00:30 EKB Jul 7
    // (2026-07-06T18:30Z → 2026-07-06T19:30Z). Its START day-key is Jul 6, so the
    // OLD start-day-key bucketing filed it under the PREVIOUS day and today's
    // early window ignored it. Overlap catches it. (A 10:00–19:00 salon has no
    // bookable slot that early, so this asserts the corrected CONFLICT SET, which
    // is what matters for early-opening / longer overnight bookings.)
    const booking = {
      startAtUtc: new Date("2026-07-06T18:30:00.000Z"), // 23:30 EKB Jul 6
      endAtUtc: new Date("2026-07-06T19:30:00.000Z"), // 00:30 EKB Jul 7
    };
    const todayKey = "2026-07-07";

    it("its start day-key is the PREVIOUS salon day (old bucketing missed it)", () => {
      expect(toLocalDateKey(booking.startAtUtc, EKB)).toBe("2026-07-06");
      expect(toLocalDateKey(booking.startAtUtc, EKB)).not.toBe(todayKey);
    });

    it("overlap over today's salon window INCLUDES it", () => {
      const { startUtc, endExclusiveUtc } = localDayRangeUtc(todayKey, EKB);
      expect(bookingOverlapsRange(booking, startUtc, endExclusiveUtc)).toBe(true);
    });
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

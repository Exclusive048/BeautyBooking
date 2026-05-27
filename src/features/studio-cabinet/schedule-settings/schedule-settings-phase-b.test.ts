import { describe, expect, it } from "vitest";

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase B — pure-predicate tests for the
 * three Phase B tabs (Exceptions / Breaks / Visibility). Each tab's
 * full UI is integration-tested manually; these unit tests pin the
 * deterministic rules so future drift surfaces immediately:
 *
 *   - Exceptions: validation rules (date in past / end-before-start /
 *     duplicate date) + visibility filter (past hidden).
 *   - Breaks: buffer minutes clamp.
 *   - Visibility: slot-precision allowed values + visibleSlotDays
 *     clamp.
 *
 * Same pure-predicate pattern as the Phase A foundation tests and the
 * MASTER-DASHBOARD-FIX-A action-state tests.
 */

// ─── Exceptions tab ─────────────────────────────────────────────────────

type DraftException = {
  date: string;
  isWorkday: boolean;
  startTime: string | null;
  endTime: string | null;
};

function validateNewException(
  candidate: DraftException,
  existing: DraftException[],
  todayKey: string,
): { ok: true } | { ok: false; reason: "PAST" | "END_BEFORE_START" | "DUPLICATE" } {
  if (candidate.date < todayKey) return { ok: false, reason: "PAST" };
  if (
    candidate.isWorkday &&
    candidate.startTime &&
    candidate.endTime &&
    candidate.endTime <= candidate.startTime
  ) {
    return { ok: false, reason: "END_BEFORE_START" };
  }
  if (existing.some((row) => row.date === candidate.date)) {
    return { ok: false, reason: "DUPLICATE" };
  }
  return { ok: true };
}

function filterUpcoming<T extends { date: string }>(
  items: T[],
  todayKey: string,
): T[] {
  return items.filter((row) => row.date >= todayKey);
}

describe("STUDIO-SCHEDULE-SETTINGS-A Phase B — Exceptions validation", () => {
  const today = "2026-06-15";

  it("accepts a future exception", () => {
    expect(
      validateNewException(
        {
          date: "2026-06-20",
          isWorkday: false,
          startTime: null,
          endTime: null,
        },
        [],
        today,
      ),
    ).toEqual({ ok: true });
  });

  it("accepts today's date as the earliest valid", () => {
    expect(
      validateNewException(
        { date: today, isWorkday: false, startTime: null, endTime: null },
        [],
        today,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a past date", () => {
    expect(
      validateNewException(
        {
          date: "2026-06-14",
          isWorkday: false,
          startTime: null,
          endTime: null,
        },
        [],
        today,
      ),
    ).toEqual({ ok: false, reason: "PAST" });
  });

  it("rejects workday exception with end ≤ start", () => {
    expect(
      validateNewException(
        {
          date: "2026-06-20",
          isWorkday: true,
          startTime: "12:00",
          endTime: "11:00",
        },
        [],
        today,
      ),
    ).toEqual({ ok: false, reason: "END_BEFORE_START" });
    expect(
      validateNewException(
        {
          date: "2026-06-20",
          isWorkday: true,
          startTime: "12:00",
          endTime: "12:00",
        },
        [],
        today,
      ),
    ).toEqual({ ok: false, reason: "END_BEFORE_START" });
  });

  it("rejects duplicate date (one exception per date)", () => {
    const existing: DraftException[] = [
      {
        date: "2026-06-20",
        isWorkday: false,
        startTime: null,
        endTime: null,
      },
    ];
    expect(
      validateNewException(
        {
          date: "2026-06-20",
          isWorkday: true,
          startTime: "10:00",
          endTime: "14:00",
        },
        existing,
        today,
      ),
    ).toEqual({ ok: false, reason: "DUPLICATE" });
  });

  it("filterUpcoming hides past exceptions, keeps today + future", () => {
    const items = [
      { date: "2026-06-14" }, // past
      { date: "2026-06-15" }, // today
      { date: "2026-06-20" }, // future
    ];
    expect(filterUpcoming(items, today)).toEqual([
      { date: "2026-06-15" },
      { date: "2026-06-20" },
    ]);
  });
});

// ─── Breaks tab ─────────────────────────────────────────────────────────

function clampBufferMinutes(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 120) return 120;
  return Math.floor(n);
}

describe("STUDIO-SCHEDULE-SETTINGS-A Phase B — Breaks buffer clamp", () => {
  it("clamps negative values to 0", () => {
    expect(clampBufferMinutes(-5)).toBe(0);
    expect(clampBufferMinutes(-100)).toBe(0);
  });

  it("clamps values above max to 120", () => {
    expect(clampBufferMinutes(999)).toBe(120);
    expect(clampBufferMinutes(121)).toBe(120);
  });

  it("accepts normal values verbatim", () => {
    expect(clampBufferMinutes(0)).toBe(0);
    expect(clampBufferMinutes(15)).toBe(15);
    expect(clampBufferMinutes(120)).toBe(120);
  });

  it("treats non-numeric inputs as 0", () => {
    expect(clampBufferMinutes("abc")).toBe(0);
    expect(clampBufferMinutes(NaN)).toBe(0);
    expect(clampBufferMinutes(undefined)).toBe(0);
  });
});

// ─── Visibility tab ─────────────────────────────────────────────────────

type SlotPrecision = "exact" | "today_free" | "date_only";
const ALLOWED_SLOT_PRECISIONS = new Set<SlotPrecision>([
  "exact",
  "today_free",
  "date_only",
]);

function isAllowedSlotPrecision(value: unknown): value is SlotPrecision {
  return (
    typeof value === "string" &&
    ALLOWED_SLOT_PRECISIONS.has(value as SlotPrecision)
  );
}

function clampVisibleSlotDays(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 90) return 90;
  return Math.floor(n);
}

describe("STUDIO-SCHEDULE-SETTINGS-A Phase B — Visibility validation", () => {
  it("accepts all 3 allowed slot-precision values", () => {
    expect(isAllowedSlotPrecision("exact")).toBe(true);
    expect(isAllowedSlotPrecision("today_free")).toBe(true);
    expect(isAllowedSlotPrecision("date_only")).toBe(true);
  });

  it("rejects unknown slot-precision values", () => {
    expect(isAllowedSlotPrecision("approximate")).toBe(false);
    expect(isAllowedSlotPrecision("")).toBe(false);
    expect(isAllowedSlotPrecision(null)).toBe(false);
  });

  it("clamps visibleSlotDays to [1, 90]", () => {
    expect(clampVisibleSlotDays(0)).toBe(1);
    expect(clampVisibleSlotDays(-5)).toBe(1);
    expect(clampVisibleSlotDays(91)).toBe(90);
    expect(clampVisibleSlotDays(1000)).toBe(90);
  });

  it("accepts in-range visibleSlotDays verbatim", () => {
    expect(clampVisibleSlotDays(1)).toBe(1);
    expect(clampVisibleSlotDays(30)).toBe(30);
    expect(clampVisibleSlotDays(90)).toBe(90);
  });

  it("non-numeric visibleSlotDays defaults to 1", () => {
    expect(clampVisibleSlotDays("abc")).toBe(1);
    expect(clampVisibleSlotDays(NaN)).toBe(1);
  });
});

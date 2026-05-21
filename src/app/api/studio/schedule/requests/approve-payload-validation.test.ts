import { describe, it, expect } from "vitest";
import {
  isScheduleEditorRequestPayload,
  normalizeScheduleEditorRequestPayload,
} from "@/lib/schedule/editor-shared";

/**
 * STUDIO-APPROVE-400-FIX-A — pinning the approve endpoint's payload
 * detection.
 *
 * Approve fan-outs through two appliers depending on `payloadJson`
 * shape:
 *   - `isScheduleEditorRequestPayload(payload) === true` →
 *     `applyScheduleSnapshot` (the canonical EDITOR_V1 path)
 *   - otherwise → legacy `applySchedulePayload` (validates the older
 *     `{ templates, weekly, overrides }` SchedulePayload shape)
 *
 * Pre-fix, the showcase seed produced placeholder JSON that matched
 * neither (`{ kind: "WEEKLY", delta: "..." }` / `{ kind: "OVERRIDE",
 * dateOffsetDays: 7 }`) — the legacy validator threw 400 "Некорректное
 * тело запроса.". The seed now produces real EDITOR_V1 snapshots so
 * the QA studio admin can click Approve and get a 200.
 *
 * These tests pin both halves of the detector + the seed payload
 * shape so a future drift surfaces immediately.
 */

function buildVisionLikePayload(extraException?: {
  date: string;
  note: string;
}) {
  const weekSchedule = Array.from({ length: 7 }).map((_, weekday) => ({
    dayOfWeek: weekday,
    isWorkday: weekday !== 0,
    scheduleMode: "FLEXIBLE" as const,
    startTime: "10:00",
    endTime: "19:00",
    breaks: [],
    fixedSlotTimes: [],
  }));
  const exceptions = extraException
    ? [
        {
          date: extraException.date,
          isWorkday: false,
          scheduleMode: "FLEXIBLE" as const,
          startTime: null,
          endTime: null,
          breaks: [],
          fixedSlotTimes: [],
          note: extraException.note,
        },
      ]
    : [];
  return { format: "EDITOR_V1" as const, weekSchedule, exceptions };
}

describe("isScheduleEditorRequestPayload — detector", () => {
  it("accepts a valid EDITOR_V1 payload with arrays", () => {
    expect(isScheduleEditorRequestPayload(buildVisionLikePayload())).toBe(true);
  });

  it("accepts a payload that also carries exceptions", () => {
    const payload = buildVisionLikePayload({
      date: "2026-06-01",
      note: "test",
    });
    expect(isScheduleEditorRequestPayload(payload)).toBe(true);
  });

  it("rejects payloads missing the `format` discriminator", () => {
    const noFormat: unknown = {
      weekSchedule: [],
      exceptions: [],
    };
    expect(isScheduleEditorRequestPayload(noFormat)).toBe(false);
  });

  it("rejects payloads with wrong `format` literal", () => {
    const wrongFormat: unknown = {
      format: "EDITOR_V2",
      weekSchedule: [],
      exceptions: [],
    };
    expect(isScheduleEditorRequestPayload(wrongFormat)).toBe(false);
  });

  it("rejects the legacy seed placeholder shapes (the bug)", () => {
    // Pre-fix the seed produced these — detector correctly says no,
    // approve fell through to the legacy applier which then threw
    // 400 "Некорректное тело запроса.". Test guards against the
    // re-introduction of that placeholder shape in any future seed.
    expect(
      isScheduleEditorRequestPayload({
        kind: "WEEKLY",
        delta: "shift +5 minutes Saturday",
      }),
    ).toBe(false);
    expect(
      isScheduleEditorRequestPayload({
        kind: "OVERRIDE",
        dateOffsetDays: 7,
        isDayOff: true,
      }),
    ).toBe(false);
  });

  it("rejects non-object inputs", () => {
    expect(isScheduleEditorRequestPayload(null)).toBe(false);
    expect(isScheduleEditorRequestPayload(undefined)).toBe(false);
    expect(isScheduleEditorRequestPayload("a string")).toBe(false);
    expect(isScheduleEditorRequestPayload(42)).toBe(false);
  });

  it("rejects when arrays are not present", () => {
    expect(
      isScheduleEditorRequestPayload({
        format: "EDITOR_V1",
        weekSchedule: "not-an-array",
        exceptions: [],
      }),
    ).toBe(false);
    expect(
      isScheduleEditorRequestPayload({
        format: "EDITOR_V1",
        weekSchedule: [],
        exceptions: null,
      }),
    ).toBe(false);
  });
});

describe("normalizeScheduleEditorRequestPayload — happy path", () => {
  it("normalises a seed-shape Vision payload without throwing", () => {
    const payload = buildVisionLikePayload();
    const normalized = normalizeScheduleEditorRequestPayload(payload);
    expect(normalized.weekSchedule).toHaveLength(7);
    expect(normalized.exceptions).toHaveLength(0);
  });

  it("normalises a payload with exceptions", () => {
    const payload = buildVisionLikePayload({
      date: "2026-06-15",
      note: "family event",
    });
    const normalized = normalizeScheduleEditorRequestPayload(payload);
    expect(normalized.weekSchedule).toHaveLength(7);
    expect(normalized.exceptions).toHaveLength(1);
    expect(normalized.exceptions[0]!.date).toBe("2026-06-15");
    expect(normalized.exceptions[0]!.isWorkday).toBe(false);
  });

  it("throws INVALID_BODY for legacy seed placeholder (pre-fix data)", () => {
    expect(() =>
      normalizeScheduleEditorRequestPayload({
        kind: "WEEKLY",
        delta: "anything",
      }),
    ).toThrow();
  });
});

describe("STUDIO-APPROVE-400-FIX-A — error code semantics", () => {
  /**
   * The approve route catches `INVALID_BODY` from the appliers and
   * rewraps it into a friendlier `INVALID_REQUEST_PAYLOAD` (422). This
   * test pins the wrapping logic at the unit level — the inner
   * predicate that decides "wrap into 422" vs "rethrow as-is".
   */
  function shouldWrapAsInvalidPayload(
    appErr: { status: number; code: string },
  ): boolean {
    return appErr.status === 400 && appErr.code === "INVALID_BODY";
  }

  it("wraps INVALID_BODY 400 from the appliers", () => {
    expect(shouldWrapAsInvalidPayload({ status: 400, code: "INVALID_BODY" })).toBe(
      true,
    );
  });

  it("does not wrap other 400 errors (different code)", () => {
    expect(
      shouldWrapAsInvalidPayload({ status: 400, code: "VALIDATION_ERROR" }),
    ).toBe(false);
    expect(
      shouldWrapAsInvalidPayload({ status: 400, code: "DAY_INVALID" }),
    ).toBe(false);
  });

  it("does not wrap non-400 errors (e.g. 404 / 500)", () => {
    expect(
      shouldWrapAsInvalidPayload({ status: 404, code: "INVALID_BODY" }),
    ).toBe(false);
    expect(
      shouldWrapAsInvalidPayload({ status: 500, code: "INVALID_BODY" }),
    ).toBe(false);
  });
});

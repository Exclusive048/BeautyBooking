import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  ANALYTICS_RANGE_DATES_MESSAGE,
  ANALYTICS_RANGE_ORDER_MESSAGE,
  resolveRangeWithCompare,
} from "@/features/analytics/domain/date-range";

/**
 * MOBILE-POLISH — неверный период аналитики: 400 `VALIDATION_ERROR` с русским
 * текстом, а не голый `Error` (его `toAppError` превращал в 500).
 */

function caught(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected AppError");
}

describe("resolveRangeWithCompare", () => {
  it("начало позже конца — 400 VALIDATION_ERROR", () => {
    const error = caught(() =>
      resolveRangeWithCompare({ period: "custom", timeZone: "Europe/Moscow", from: "2026-10-10", to: "2026-10-01" }),
    );
    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe(ANALYTICS_RANGE_ORDER_MESSAGE);
  });

  it("custom без дат — 400 VALIDATION_ERROR", () => {
    const error = caught(() => resolveRangeWithCompare({ period: "custom", timeZone: "Europe/Moscow", from: null }));
    expect(error.status).toBe(400);
    expect(error.message).toBe(ANALYTICS_RANGE_DATES_MESSAGE);
  });

  it("верный период и один день — без ошибки", () => {
    const { range, prevRange } = resolveRangeWithCompare({
      period: "custom",
      timeZone: "Europe/Moscow",
      from: "2026-10-01",
      to: "2026-10-01",
      compare: true,
    });
    expect(range.days).toBe(1);
    expect(prevRange?.toKey).toBe("2026-09-30");
  });
});

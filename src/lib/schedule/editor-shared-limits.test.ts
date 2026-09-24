import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BOOKING_RULE_LIMITS,
  normalizeBookingRules,
  normalizeBufferMin,
  normalizeVisibility,
  type BookingRulesDto,
  type VisibilityDto,
} from "./editor-shared";

/**
 * SCHEDULE-RULES-FREE-INPUT (2026-09-24).
 *
 * Кабинет студии вводит правила записи числом, а нормализаторы сверяли его с
 * набором кнопок кабинета мастера: «13 часов» молча заменялись прежним
 * значением, буфер вне списка — нулём. Здесь пиннится диапазон вместо набора
 * и то, что «значение по умолчанию» пустого поля совпадает с дефолтом колонки.
 */

const RULES: BookingRulesDto = {
  minHoursAhead: 2,
  maxDaysAhead: 90,
  autoConfirm: false,
  freeCancelHours: 24,
  lateCancelAction: "none",
};

const VISIBILITY: VisibilityDto = {
  isPublished: true,
  slotPrecision: "exact",
  visibleSlotDays: 30,
  acceptNewClients: true,
};

describe("normalizeBookingRules — диапазон, а не набор кнопок", () => {
  it("сохраняет значения вне прежнего набора (13 ч, 45 дн, 30 ч отмены)", () => {
    const out = normalizeBookingRules(
      { ...RULES, minHoursAhead: 13, maxDaysAhead: 45, freeCancelHours: 30 },
      RULES,
    );
    expect(out.minHoursAhead).toBe(13);
    expect(out.maxDaysAhead).toBe(45);
    expect(out.freeCancelHours).toBe(30);
  });

  it("прижимает к границам, а не откатывает к прежнему значению", () => {
    const out = normalizeBookingRules(
      { ...RULES, minHoursAhead: 500, maxDaysAhead: 0, freeCancelHours: 1000 },
      RULES,
    );
    expect(out.minHoursAhead).toBe(BOOKING_RULE_LIMITS.minHoursAhead.max);
    expect(out.maxDaysAhead).toBe(BOOKING_RULE_LIMITS.maxDaysAhead.min);
    expect(out.freeCancelHours).toBe(BOOKING_RULE_LIMITS.freeCancelHours.max);
  });

  it("нечисло оставляет прежнее значение", () => {
    const out = normalizeBookingRules({ ...RULES, minHoursAhead: "13", maxDaysAhead: 1.5 }, {
      ...RULES,
      minHoursAhead: 6,
      maxDaysAhead: 60,
    });
    expect(out.minHoursAhead).toBe(6);
    expect(out.maxDaysAhead).toBe(60);
  });

  it("0 ч бесплатной отмены сохраняется (CANCEL-DEADLINE-ZERO-01)", () => {
    expect(normalizeBookingRules({ ...RULES, freeCancelHours: 0 }, RULES).freeCancelHours).toBe(0);
  });
});

describe("normalizeVisibility / normalizeBufferMin", () => {
  it("видимые дни — любое целое в диапазоне", () => {
    expect(normalizeVisibility({ ...VISIBILITY, visibleSlotDays: 45 }, VISIBILITY).visibleSlotDays).toBe(45);
    expect(normalizeVisibility({ ...VISIBILITY, visibleSlotDays: 400 }, VISIBILITY).visibleSlotDays).toBe(
      BOOKING_RULE_LIMITS.visibleSlotDays.max,
    );
  });

  it("буфер: любое целое 0..30, выше — потолок CHECK-констрейнта, а не ноль", () => {
    expect(normalizeBufferMin(25)).toBe(25);
    expect(normalizeBufferMin(120)).toBe(30);
    expect(normalizeBufferMin(-5)).toBe(0);
    expect(normalizeBufferMin("x")).toBe(0);
  });
});

describe("fallback пустого поля = дефолт колонки в схеме", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema/provider.prisma"), "utf8");
  const defaultOf = (column: string): number => {
    const match = schema.match(new RegExp(`\\b${column}\\s+Int\\s+@default\\((\\d+)\\)`));
    if (!match) throw new Error(`no @default for ${column}`);
    return Number(match[1]);
  };

  it.each([
    ["minBookingHoursAhead", BOOKING_RULE_LIMITS.minHoursAhead.fallback],
    ["maxBookingDaysAhead", BOOKING_RULE_LIMITS.maxDaysAhead.fallback],
    ["visibleSlotDays", BOOKING_RULE_LIMITS.visibleSlotDays.fallback],
    ["bufferBetweenBookingsMin", BOOKING_RULE_LIMITS.bufferMin.fallback],
  ])("%s", (column, fallback) => {
    expect(fallback).toBe(defaultOf(column));
  });
});

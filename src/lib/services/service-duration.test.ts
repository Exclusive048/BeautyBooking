import { describe, expect, it } from "vitest";
import {
  SERVICE_DURATION_OPTIONS,
  snapServiceDurationMin,
} from "./service-duration";

describe("SERVICE_DURATION_OPTIONS — одна сетка длительности услуги", () => {
  it("до двух часов — шагом 15 минут", () => {
    expect(SERVICE_DURATION_OPTIONS.slice(0, 8)).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
  });

  it("после двух часов — шагом 30 минут, до 12 часов", () => {
    const coarse = SERVICE_DURATION_OPTIONS.slice(8);
    expect(coarse.slice(0, 4)).toEqual([150, 180, 210, 240]);
    expect(coarse.at(-1)).toBe(720);
    coarse.forEach((value, index) => {
      expect(value).toBe(150 + index * 30);
    });
  });

  it("ни одной ступени мимо сетки — «110 минут» в списке не бывает", () => {
    expect(SERVICE_DURATION_OPTIONS).not.toContain(110);
    expect(SERVICE_DURATION_OPTIONS).not.toContain(135);
  });
});

describe("snapServiceDurationMin — ввод мимо сетки округляется, а не отклоняется", () => {
  it("значение сетки не меняется (идемпотентно)", () => {
    for (const value of SERVICE_DURATION_OPTIONS) {
      expect(snapServiceDurationMin(value)).toBe(value);
    }
  });

  it("до двух часов — к ближайшим 15 минутам", () => {
    expect(snapServiceDurationMin(110)).toBe(105);
    expect(snapServiceDurationMin(113)).toBe(120);
    expect(snapServiceDurationMin(50)).toBe(45);
    expect(snapServiceDurationMin(53)).toBe(60);
  });

  it("после двух часов — к ближайшим 30 минутам, ничья вверх", () => {
    expect(snapServiceDurationMin(125)).toBe(120);
    expect(snapServiceDurationMin(135)).toBe(150);
    expect(snapServiceDurationMin(200)).toBe(210);
    expect(snapServiceDurationMin(24 * 60)).toBe(24 * 60);
  });

  it("меньше 15 минут и мусор — 15", () => {
    expect(snapServiceDurationMin(0)).toBe(15);
    expect(snapServiceDurationMin(5)).toBe(15);
    expect(snapServiceDurationMin(-30)).toBe(15);
    expect(snapServiceDurationMin(Number.NaN)).toBe(15);
  });
});

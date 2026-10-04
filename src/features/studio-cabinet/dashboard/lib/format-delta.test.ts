import { describe, expect, it } from "vitest";
import { formatPointsDelta, formatRatingDelta, formatRelativeDelta } from "./format-delta";

/**
 * MOBILE-STUDIO-C (ops) — дельты KPI дашборда студии несут число (`value`)
 * рядом с готовой строкой: приложение форматирует само. Строки веба не меняются.
 */

describe("formatRelativeDelta", () => {
  it("целые проценты и знак", () => {
    expect(formatRelativeDelta(1500, 1200)).toEqual({ text: "+25%", tone: "positive", value: 25 });
    expect(formatRelativeDelta(38, 40)).toEqual({ text: "−5%", tone: "negative", value: -5 });
  });

  it("сравнивать не с чем — null", () => {
    expect(formatRelativeDelta(10, 0)).toEqual({ text: "—", tone: "neutral", value: null });
  });

  it("без изменения — 0, а не −0", () => {
    const delta = formatRelativeDelta(1000, 1001);
    expect(delta).toEqual({ text: "—", tone: "neutral", value: 0 });
    expect(Object.is(delta.value, -0)).toBe(false);
  });
});

describe("formatPointsDelta", () => {
  it("процентные пункты", () => {
    expect(formatPointsDelta(34, 28)).toEqual({ text: "+6 п.п.", tone: "positive", value: 6 });
    expect(formatPointsDelta(27, 28)).toEqual({ text: "−1 п.п.", tone: "negative", value: -1 });
    expect(formatPointsDelta(28, 28).value).toBe(0);
  });
});

describe("formatRatingDelta", () => {
  it("один знак после запятой", () => {
    expect(formatRatingDelta(4.8, 4.6)).toMatchObject({ tone: "positive", value: 0.2 });
    expect(formatRatingDelta(4.8, 4.8)).toEqual({ text: "—", tone: "neutral", value: 0 });
  });
});

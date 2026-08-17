import { describe, expect, it } from "vitest";

import { DATETIME_OPT_RE, TZ_AWARE_RE } from "./tz-patterns.mjs";

/**
 * LOGIC-29 — `TZ_AWARE_RE` требовала двоеточия (`/timeZone\s*:/`), поэтому
 * ES6-шорткат `{ timeZone }` гейт не распознавал и репортил корректный код.
 * Пять ложных срабатываний на живых salon-tz поверхностях (`client-bookings-page`,
 * `studio-cabinet/.../booking-row`, `group-by-month`, `analytics/domain/helpers`
 * — все передают зону шорткатом и salon-tz соблюдают).
 *
 * Почему это стоит теста, а не «поправили и ладно»: инструмент, который
 * стабильно указывает на исправное, перестают читать — и тогда он пропускает
 * настоящее. Ровно так и жил `check:schema-drift`, красневший с 13 июля.
 *
 * Опасность фикса симметрична: расширить глушилку слишком сильно и потерять
 * настоящих кандидатов. Поэтому тест закрывает обе стороны.
 */

describe("TZ_AWARE_RE — распознаёт явную зону (LOGIC-29)", () => {
  it("полная форма", () => {
    expect(TZ_AWARE_RE.test('{ hour: "2-digit", timeZone: salonTz }')).toBe(true);
    expect(TZ_AWARE_RE.test("{ timeZone:tz }")).toBe(true);
  });

  it("ES6-шорткат — ровно то, что не видела прежняя регулярка", () => {
    expect(TZ_AWARE_RE.test("{ timeZone }")).toBe(true);
    expect(TZ_AWARE_RE.test('{ hour: "2-digit", timeZone, minute: "2-digit" }')).toBe(true);
  });

  it("шорткат в многострочном объекте опций", () => {
    const window = ['new Intl.DateTimeFormat("ru-RU", {', '  day: "2-digit",', "  timeZone,", "})"].join(
      "\n"
    );
    expect(TZ_AWARE_RE.test(window)).toBe(true);
  });

  it("шорткат последним ключом, перед закрывающей скобкой", () => {
    expect(TZ_AWARE_RE.test('{ day: "2-digit",\n  timeZone\n}')).toBe(true);
  });
});

describe("TZ_AWARE_RE — НЕ глушит то, что глушить нельзя (LOGIC-29)", () => {
  it("timeZoneName — другая опция: она печатает название зоны, а не задаёт её", () => {
    expect(TZ_AWARE_RE.test('{ hour: "2-digit", timeZoneName: "short" }')).toBe(false);
    // и при этом остаётся признаком рендера даты/времени
    expect(DATETIME_OPT_RE.test('{ timeZoneName: "short" }')).toBe(true);
  });

  it("объявление переменной не считается заданием зоны", () => {
    expect(TZ_AWARE_RE.test("const timeZone = provider.timezone;")).toBe(false);
    expect(TZ_AWARE_RE.test("let timeZone = tz")).toBe(false);
  });

  it("сырой рендер без зоны остаётся кандидатом", () => {
    expect(TZ_AWARE_RE.test('date.toLocaleTimeString("ru-RU", { hour: "2-digit" })')).toBe(false);
  });

  it("похожие имена не совпадают", () => {
    expect(TZ_AWARE_RE.test("{ viewerTimeZoneLabel: x }")).toBe(false);
  });
});

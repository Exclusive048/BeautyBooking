import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { utcDateKey } from "@/features/admin-cabinet/dashboard/server/shared";

/**
 * LOGIC-28 — точки admin-графика бакетируются строго по UTC (`utcDateKey` →
 * `toISOString().slice(0,10)`, `setUTCDate`), а подписывались форматтером БЕЗ
 * `timeZone`, то есть в ambient-tz процесса. Один и тот же `date` получал ключ
 * по одному календарю и подпись по другому.
 *
 * При RU-хостинге (положительное смещение) UTC-полночь попадает в тот же
 * календарный день, поэтому расхождения СЕГОДНЯ нет — дефект в том, что выбор
 * не был объявлен и внутренне противоречив: площадка с отрицательным смещением
 * сдвинула бы подписи на день относительно собственных бакетов, молча.
 *
 * Тест проверяет само свойство «подпись = день бакета» и делает это на
 * инстантах у границы суток, где расхождение только и проявляется.
 */

const CHARTS_SERVICE = resolve(
  process.cwd(),
  "src/features/admin-cabinet/dashboard/server/charts.service.ts"
);

/** UTC-полночь и соседние с ней инстанты — единственное место, где tz решает. */
const INSTANTS = [
  "2026-08-12T00:00:00.000Z",
  "2026-08-12T00:30:00.000Z",
  "2026-08-12T23:30:00.000Z",
  "2026-01-01T00:00:00.000Z", // ещё и смена года
];

describe("подписи точек графика — LOGIC-28", () => {
  it("подпись дня совпадает с днём UTC-бакета на границах суток", () => {
    const dayLabel = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      timeZone: "UTC",
    });

    for (const iso of INSTANTS) {
      const date = new Date(iso);
      const bucketDay = utcDateKey(date).slice(8, 10); // DD из YYYY-MM-DD
      expect(dayLabel.format(date), iso).toBe(bucketDay);
    }
  });

  it("без timeZone это свойство держится только на положительном смещении", () => {
    // Документирует, ПОЧЕМУ нужен явный UTC: формат без зоны берёт `TZ`
    // процесса, и на отрицательном смещении UTC-полночь — уже вчера.
    const ambient = new Intl.DateTimeFormat("ru-RU", { day: "2-digit" });
    const midnight = new Date("2026-08-12T00:00:00.000Z");
    const negativeOffset = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      timeZone: "America/New_York",
    });

    expect(negativeOffset.format(midnight)).toBe("11"); // не 12 — тот самый сдвиг
    // Ambient зависит от окружения прогона, поэтому утверждаем не значение, а
    // то, что он в принципе может разойтись с бакетом.
    expect(["11", "12"]).toContain(ambient.format(midnight));
  });

  it("сервис графиков задаёт timeZone во ВСЕХ форматтерах", () => {
    const source = readFileSync(CHARTS_SERVICE, "utf8");
    const formatters = source.match(/new Intl\.DateTimeFormat\([\s\S]*?\}\)/g) ?? [];
    expect(formatters.length).toBeGreaterThan(0);
    for (const formatter of formatters) {
      expect(formatter, "форматтер без timeZone — подпись разойдётся с бакетом").toMatch(
        /timeZone:\s*"UTC"/
      );
    }
  });
});

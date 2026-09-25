import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLLAGE_RATIO_CLASS,
  collageRatioFor,
  placeInColumns,
  type CollageRatio,
} from "./collage-layout";

/**
 * HOME-FEED-COLLAGE — раскладка коллажа.
 *
 * @probe   что сломать (выполнено 2026-09-25, с откатом байт в байт):
 *   1. класть плитку в колонку по кругу (`index % count`), а не в самую
 *      короткую → 1 failed: «плитка уходит в самую короткую колонку»;
 *   2. подмешать `Math.random()` в выбор пропорции → 2 failed: «пропорция
 *      детерминирована ключом» и «догрузка не двигает показанные плитки».
 */

describe("placeInColumns", () => {
  it("плитка уходит в самую короткую колонку, при равенстве — в левую", () => {
    const ratios: Record<string, CollageRatio> = {
      a: "portrait-tall",
      b: "square",
      c: "square",
      d: "square",
    };
    const columns = placeInColumns(["a", "b", "c", "d"], 2, (key) => ratios[key]!);
    // a (высокая) → левая; b → правая; c → правая (она короче); d → левая.
    expect(columns.map((column) => column.map((cell) => cell.item))).toEqual([
      ["a", "d"],
      ["b", "c"],
    ]);
  });

  it("догрузка не двигает показанные плитки", () => {
    const keys = Array.from({ length: 30 }, (_, i) => `group-${i}`);
    const before = placeInColumns(keys.slice(0, 18), 6, collageRatioFor);
    const after = placeInColumns(keys, 6, collageRatioFor);
    before.forEach((column, index) => {
      expect(after[index]!.slice(0, column.length)).toEqual(column);
    });
  });

  it("сохраняет индекс в исходном списке и не теряет плиток", () => {
    const keys = Array.from({ length: 11 }, (_, i) => `k${i}`);
    const cells = placeInColumns(keys, 3, collageRatioFor).flat();
    expect(cells.map((cell) => cell.index).sort((a, b) => a - b)).toEqual(
      keys.map((_, i) => i),
    );
  });

  it("ноль и дробь колонок сводятся к целому ≥ 1", () => {
    expect(placeInColumns(["a"], 0, collageRatioFor)).toHaveLength(1);
    expect(placeInColumns(["a"], 2.7, collageRatioFor)).toHaveLength(2);
  });
});

describe("collageRatioFor", () => {
  it("пропорция детерминирована ключом", () => {
    const keys = Array.from({ length: 40 }, (_, i) => `e_key-${i}`);
    expect(keys.map(collageRatioFor)).toEqual(keys.map(collageRatioFor));
  });

  it("в рисунке несколько пропорций — это коллаж, а не ровная сетка", () => {
    const keys = Array.from({ length: 40 }, (_, i) => `e_key-${i}`);
    expect(new Set(keys.map(collageRatioFor)).size).toBeGreaterThan(2);
  });

  it("альбомных плиток нет: высота не меньше ширины", () => {
    for (const cls of Object.values(COLLAGE_RATIO_CLASS)) {
      const match = /aspect-\[(\d+)\/(\d+)\]/.exec(cls);
      if (cls === "aspect-square") continue;
      expect(match, cls).not.toBeNull();
      expect(Number(match![1])).toBeLessThanOrEqual(Number(match![2]));
    }
  });

  it("классы пропорций стоят литералами в исходнике (их видит Tailwind)", () => {
    const source = readFileSync(resolve(__dirname, "collage-layout.ts"), "utf-8");
    for (const cls of Object.values(COLLAGE_RATIO_CLASS)) {
      expect(source).toContain(`"${cls}"`);
    }
  });
});

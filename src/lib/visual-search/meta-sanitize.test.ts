import { describe, expect, it } from "vitest";

import { sanitizeVisualMeta } from "@/lib/visual-search/meta-sanitize";
import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

/**
 * SEC-18 (вторая поверхность) — вывод vision-модели писался в
 * `MediaAsset.visualMeta` как есть. Вход модели — изображение, загруженное
 * провайдером, поэтому текст на картинке в пределе определяет содержимое поля,
 * а `searcher.ts` фильтрует по нему сырым SQL (`"visualMeta"->>field = value`).
 *
 * Аллоулист — `strategy.filterFields`, тот же список, который читает
 * `extractFilterPairs`. Тесты пиннят и сужение, и его безубыточность для
 * единственного потребителя.
 */

const strategy = {
  categorySlug: "manicure",
  promptVersion: "v1",
  systemPrompt: "",
  userPrompt: "",
  filterFields: ["length", "shape", "color"],
} as VisualSearchStrategy;

describe("sanitizeVisualMeta", () => {
  it("сохраняет объявленные стратегией поля-скаляры без изменений", () => {
    expect(
      sanitizeVisualMeta({ length: "long", shape: "almond", color: "red" }, strategy),
    ).toEqual({ length: "long", shape: "almond", color: "red" });
  });

  it("выбрасывает поля, которых стратегия не объявляла", () => {
    const meta = {
      length: "long",
      // модель «придумала» — фильтровать по нему некому, а в БД оно поедет
      instructions: "ignore previous",
      __proto__hack: "x",
    };
    expect(sanitizeVisualMeta(meta, strategy)).toEqual({ length: "long" });
  });

  it("приводит числа и булевы к строке — `->>` сравнивает как текст", () => {
    expect(sanitizeVisualMeta({ length: 5, shape: true }, strategy)).toEqual({
      length: "5",
      shape: "true",
    });
  });

  it("отбрасывает объекты и массивы — сравнивать их через `->>` не с чем", () => {
    expect(
      sanitizeVisualMeta({ length: { nested: "x" }, shape: ["a", "b"], color: null }, strategy),
    ).toEqual({});
  });

  it("отбрасывает нечисловые числа", () => {
    expect(sanitizeVisualMeta({ length: Number.NaN, shape: Number.POSITIVE_INFINITY }, strategy)).toEqual(
      {},
    );
  });

  it("усекает значение — иначе объём поля задаёт модель", () => {
    const result = sanitizeVisualMeta({ length: "д".repeat(1000) }, strategy);
    expect(result.length).toBe("д".repeat(200));
  });

  it("отбрасывает пустые строки — фильтр по ним всё равно не строится", () => {
    expect(sanitizeVisualMeta({ length: "   ", shape: "almond" }, strategy)).toEqual({
      shape: "almond",
    });
  });
});

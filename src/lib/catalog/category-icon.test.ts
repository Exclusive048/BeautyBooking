import { describe, expect, it } from "vitest";

import {
  CATEGORY_ICON_PRESETS,
  categoryLabel,
  isCategoryIcon,
  normalizeCategoryIcon,
} from "@/lib/catalog/category-icon";
import { SYSTEM_CATEGORIES } from "@/lib/catalog/system-categories";

/**
 * Смайлик категории (CATEGORY-ICONS-01): проверка «ровно один смайлик» и
 * подпись «смайлик + название».
 *
 * @probe 2026-10-03 (по одной оси):
 *   1. Из выражения убрано ZWJ-продолжение → красные «каждый смайлик набора и
 *      подсказок проходит» на «💁‍♀️» и «🧖‍♀️».
 *   2. Убран якорь `$` → красный «буквы, два смайлика … не проходят» на «💅💄».
 */

describe("isCategoryIcon", () => {
  it("каждый смайлик системного набора и подсказок проходит", () => {
    const icons = [...SYSTEM_CATEGORIES.map((category) => category.icon), ...CATEGORY_ICON_PRESETS];
    for (const icon of icons) {
      expect(isCategoryIcon(icon), icon).toBe(true);
    }
  });

  it("оттенок кожи и вариация — тоже один смайлик", () => {
    expect(isCategoryIcon("💅🏽")).toBe(true);
    expect(isCategoryIcon("☀")).toBe(true);
  });

  it("буквы, два смайлика, смайлик с текстом и пустая строка не проходят", () => {
    for (const value of ["", "М", "abc", "💅💄", "💅 ногти", "1", "★★"]) {
      expect(isCategoryIcon(value), value).toBe(false);
    }
  });

  it("подсказки не повторяются", () => {
    expect(new Set(CATEGORY_ICON_PRESETS).size).toBe(CATEGORY_ICON_PRESETS.length);
  });
});

describe("подпись категории", () => {
  it("смайлик перед названием, пустой — только название", () => {
    expect(categoryLabel({ name: "Маникюр", icon: "💅" })).toBe("💅 Маникюр");
    expect(categoryLabel({ name: "Маникюр", icon: "  " })).toBe("Маникюр");
    expect(categoryLabel({ name: "Маникюр", icon: null })).toBe("Маникюр");
    expect(categoryLabel({ name: "Маникюр" })).toBe("Маникюр");
  });

  it("пробелы вокруг — «без смайлика»", () => {
    expect(normalizeCategoryIcon("  ")).toBeNull();
    expect(normalizeCategoryIcon(" 💅 ")).toBe("💅");
    expect(normalizeCategoryIcon(undefined)).toBeNull();
  });
});

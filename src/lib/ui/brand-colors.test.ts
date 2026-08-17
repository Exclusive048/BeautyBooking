/**
 * UI-04 — константы «сред без Tailwind» не расходятся с `globals.css`.
 *
 * Модуль `brand-colors.ts` существует потому, что почта, canvas, satori и
 * `global-error` не читают CSS-переменные. Цена такого зеркала известна и
 * названа в контексте проекта (HARDENING-MISC-01): токен, живущий в двух
 * местах, расходится молча — разметка выглядит правильной, цвет неверный,
 * ошибки нет. Здесь расхождение видно сразу: тест читает `globals.css`,
 * достаёт rgb-тройки из `:root`/`.dark` и сверяет с каждой константой.
 *
 * Не-вакуумность: прогонялось с `brandVia: "#A10729"` (последний разряд) —
 * краснеет ровно строка `brandVia`; и с изменённым процентом стопа в
 * `brandGradientCss` — краснеет проверка совпадения с `bg-brand-gradient`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BRAND_COLORS, brandGradientCss, withAlpha } from "./brand-colors";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const tailwindConfig = readFileSync(resolve(process.cwd(), "tailwind.config.js"), "utf8");

/** Тело блока `selector { … }` — от селектора до закрывающей скобки его уровня. */
function readVarBlock(selector: string): string {
  const start = globalsCss.indexOf(`${selector} {`);
  expect(start, `в globals.css нет блока ${selector}`).toBeGreaterThan(-1);
  const end = globalsCss.indexOf("\n  }", start);
  expect(end, `блок ${selector} не закрыт`).toBeGreaterThan(start);
  return globalsCss.slice(start, end);
}

const ROOT_BLOCK = readVarBlock(":root");
const DARK_BLOCK = readVarBlock(".dark");

function hexFromCssVar(block: string, variable: string): string {
  const match = block.match(new RegExp(`--${variable}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`));
  expect(match, `не нашли --${variable}`).not.toBeNull();
  const [, r, g, b] = match as RegExpMatchArray;
  return `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

type Mirror = { key: keyof typeof BRAND_COLORS; variable: string; scope: "root" | "dark" };

const MIRRORS: Mirror[] = [
  { key: "brandFrom", variable: "brand-from", scope: "root" },
  { key: "brandVia", variable: "brand-via", scope: "root" },
  { key: "brandDeep", variable: "brand-deep", scope: "root" },
  { key: "brandPane", variable: "brand-pane", scope: "root" },
  { key: "brandAccent", variable: "brand-accent", scope: "root" },
  { key: "textOnBrand", variable: "primary-foreground", scope: "root" },
  { key: "surfacePage", variable: "bg-page", scope: "root" },
  { key: "surfaceCard", variable: "bg-card", scope: "root" },
  { key: "textMain", variable: "text-main", scope: "root" },
  { key: "textLabel", variable: "text-label", scope: "root" },
  { key: "textSecondary", variable: "text-sec", scope: "root" },
  { key: "borderSubtle", variable: "border-subtle", scope: "root" },
  { key: "darkSurfacePage", variable: "bg-page", scope: "dark" },
  { key: "darkSurfaceCard", variable: "bg-card", scope: "dark" },
  { key: "darkTextMain", variable: "text-main", scope: "dark" },
  { key: "darkTextSecondary", variable: "text-sec", scope: "dark" },
  { key: "darkBorderSubtle", variable: "border-subtle", scope: "dark" },
];

describe("BRAND_COLORS — зеркало токенов globals.css", () => {
  it.each(MIRRORS)("$key === --$variable ($scope)", ({ key, variable, scope }) => {
    const block = scope === "root" ? ROOT_BLOCK : DARK_BLOCK;
    expect(BRAND_COLORS[key].toUpperCase()).toBe(hexFromCssVar(block, variable));
  });

  it("бренд-градиент повторяет стопы утилиты bg-brand-gradient", () => {
    // Утилита — единственное определение формы градиента в продукте; здесь та
    // же форма, только развёрнутая в литеральные цвета (переменных в почте нет).
    const utility = tailwindConfig.slice(tailwindConfig.indexOf('"brand-gradient":'));
    expect(utility).toContain("--brand-from)) 0%");
    expect(utility).toContain("--brand-via)) 55%");
    expect(utility).toContain("--brand-deep)) 100%");

    expect(brandGradientCss()).toBe(
      `linear-gradient(135deg, ${BRAND_COLORS.brandFrom} 0%, ${BRAND_COLORS.brandVia} 55%, ${BRAND_COLORS.brandDeep} 100%)`
    );
    expect(brandGradientCss("90deg")).toContain("linear-gradient(90deg,");
  });

  it("withAlpha разворачивает hex в rgba", () => {
    expect(withAlpha(BRAND_COLORS.brandFrom, 0.1)).toBe("rgba(114, 8, 8, 0.1)");
    expect(withAlpha(BRAND_COLORS.textOnBrand, 0.75)).toBe("rgba(255, 255, 255, 0.75)");
  });
});

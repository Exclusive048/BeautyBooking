/**
 * UI-05 — плейсхолдер держит порог WCAG 1.4.3 (4.5:1) в обеих темах.
 *
 * Дефект был не в одном значении, а в том, что порог никто не считал:
 * `--text-placeholder` жил рядом с фоновыми токенами, любой из которых можно
 * подвинуть «на пол-тона», и провал контраста не проявится ни в типах, ни в
 * линтере, ни на глаз — только прибором. Поэтому сторож считает ратио прямо
 * из `globals.css`: и текст, и фон читаются из файла, а не дублируются здесь.
 *
 * Плейсхолдер в этом продукте часто несёт формат ввода («+7 999 …»), то есть
 * это информативный текст, а не декор, и порог для него — обычные 4.5:1.
 *
 * Не-вакуумность: прогонялось на прежних значениях токена (#B89AA0 / #876770)
 * — краснеют все три светлые поверхности и все три тёмные.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  const end = CSS.indexOf("\n  }", start);
  return CSS.slice(start, end);
}

function rgb(scope: string, variable: string): [number, number, number] {
  const match = block(scope).match(new RegExp(`--${variable}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`));
  expect(match, `не нашли --${variable} в ${scope}`).not.toBeNull();
  const [, r, g, b] = match as RegExpMatchArray;
  return [Number(r), Number(g), Number(b)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const WCAG_AA_TEXT = 4.5;
const WCAG_NON_TEXT = 3;

describe("globals.css — контраст плейсхолдера", () => {
  // Поверхности, на которых плейсхолдер реально рисуется: заливка поля в
  // покое и в фокусе, карточка (поля с прозрачным фоном) и страница
  // (`bookings-toolbar` держит поле прямо на `bg-bg-page`).
  const SURFACES = ["bg-input", "bg-input-focus", "bg-card", "bg-page"] as const;

  it.each(SURFACES)("светлая тема: --text-placeholder на --%s ≥ 4.5:1", (surface) => {
    expect(contrast(rgb(":root", "text-placeholder"), rgb(":root", surface))).toBeGreaterThanOrEqual(
      WCAG_AA_TEXT
    );
  });

  it.each(SURFACES)("тёмная тема: --text-placeholder на --%s ≥ 4.5:1", (surface) => {
    expect(contrast(rgb(".dark", "text-placeholder"), rgb(".dark", surface))).toBeGreaterThanOrEqual(
      WCAG_AA_TEXT
    );
  });

  it("плейсхолдер не темнее основного текста — иерархия ввода сохранена", () => {
    // Введённое значение обязано читаться сильнее подсказки, иначе поле
    // выглядит заполненным, когда оно пустое.
    for (const scope of [":root", ".dark"] as const) {
      const main = contrast(rgb(scope, "text-main"), rgb(scope, "bg-input"));
      const placeholder = contrast(rgb(scope, "text-placeholder"), rgb(scope, "bg-input"));
      expect(placeholder).toBeLessThan(main);
    }
  });
});

/**
 * UI-09 — граница элемента управления держит порог WCAG 1.4.11 (3:1).
 *
 * Отдельный токен от `--border-subtle` нужен именно потому, что у двух этих
 * границ РАЗНЫЕ пороги: делитель внутри карточки — декор, а рамка поля или
 * кнопки `secondary` несёт информацию «здесь начинается интерактив», и без
 * неё элемент отличает от фона одна заливка (`--bg-input` на `--bg-card` —
 * 1.05:1). Один общий токен нельзя ни поднять (делители станут грубыми), ни
 * оставить (управление неразличимо), поэтому их два.
 *
 * Планка каждой темы считается по САМОЙ ТРЕБОВАТЕЛЬНОЙ поверхности, а не по
 * средней: в светлой это `--bg-page` (тёмная граница на самом тёмном светлом
 * фоне), в тёмной — `--bg-card` (светлая граница на самом светлом тёмном).
 * Ориентиры из самой находки этой проверки не проходят: #A08E86 даёт 2.77 на
 * `--bg-page`, #7A4048 — 1.95 на `--bg-card`.
 *
 * Не-вакуумность: прогонялось на прежнем значении (`--border-control` =
 * `--border-subtle`) — краснеют все четыре поверхности обеих тем.
 */
describe("globals.css — контраст границ элементов управления", () => {
  // Поверхности, на которых рамка управления реально рисуется: заливка поля
  // в покое и в фокусе (`.lux-input`), карточка (кнопки `secondary`/`icon`,
  // ячейки OTP) и страница (`ChipButton` держит фон `bg-bg-page`).
  const SURFACES = ["bg-input", "bg-input-focus", "bg-card", "bg-page"] as const;

  it.each(SURFACES)("светлая тема: --border-control на --%s ≥ 3:1", (surface) => {
    expect(contrast(rgb(":root", "border-control"), rgb(":root", surface))).toBeGreaterThanOrEqual(
      WCAG_NON_TEXT
    );
  });

  it.each(SURFACES)("тёмная тема: --border-control на --%s ≥ 3:1", (surface) => {
    expect(contrast(rgb(".dark", "border-control"), rgb(".dark", surface))).toBeGreaterThanOrEqual(
      WCAG_NON_TEXT
    );
  });

  it("граница управления заметнее декоративного делителя в обеих темах", () => {
    // Иначе разделение токенов вырождается: два имени с одним значением
    // выглядят как система, но не дают ничего — а именно так дефект и
    // выглядел до UI-09, когда `--border-subtle` нёс обе роли.
    for (const scope of [":root", ".dark"] as const) {
      const control = contrast(rgb(scope, "border-control"), rgb(scope, "bg-card"));
      const subtle = contrast(rgb(scope, "border-subtle"), rgb(scope, "bg-card"));
      expect(control).toBeGreaterThan(subtle);
    }
  });

  it("граница управления не перебивает вторичный текст — иерархия слоёв", () => {
    // Рамка обязана быть различима, но она рамка: если она контрастнее
    // текста рядом, взгляд уходит на контур вместо содержимого.
    for (const scope of [":root", ".dark"] as const) {
      const control = contrast(rgb(scope, "border-control"), rgb(scope, "bg-card"));
      const secondary = contrast(rgb(scope, "text-sec"), rgb(scope, "bg-card"));
      expect(control).toBeLessThan(secondary);
    }
  });
});

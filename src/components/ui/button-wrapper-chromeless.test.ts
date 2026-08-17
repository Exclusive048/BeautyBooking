import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI-26 (AUDIT-CAMPAIGN-02 п.8) — «вариант не имеет права перебивать заливку
 * вызывающего».
 *
 * Дефект, который этот пин закрывает, невидим для всех существующих гейтов и
 * прожил в трёх боевых поверхностях. `cn` — плоский join (`lib/cn.ts`), поэтому
 * при конфликте двух утилит одной группы побеждает НЕ порядок классов в
 * атрибуте, а порядок правил в собранном CSS, а Tailwind печатает утилиты одной
 * группы по алфавиту. Замер на боевом бандле:
 *
 *   .bg-bg-card     3991
 *   .bg-bg-input    4028
 *   .bg-primary/10  4414
 *   .bg-transparent 4632   ← вариант побеждал всегда
 *
 * Следствие: `<Button variant="wrapper" className="… bg-bg-card …">` рендерился
 * ПРОЗРАЧНЫМ. Рантайм-проба на `/support` до правки: computed
 * `background-color: rgba(0, 0, 0, 0)` при `class`, где одновременно есть
 * `lux-card` и `bg-bg-card`.
 *
 * `check:dead-classes` этот класс дефекта не видит ПО ПОСТРОЕНИЮ: класс есть в
 * разметке, правило есть в бандле — просто проигрывает. Поэтому пин здесь.
 *
 * Проверяется не «как выглядит wrapper», а свойство: он не объявляет ни
 * заливку, ни цвет текста, ни hover-заливку. Список запрещённых утилит — по
 * ГРУППАМ, а не по конкретным именам, иначе возврат `bg-transparent` под другим
 * именем (`bg-inherit`) прошёл бы мимо.
 */

const BUTTON_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "components", "ui", "button.tsx"),
  "utf8"
);

/** Тело `wrapper:` из объекта `variants` — строка классов между кавычками. */
function readWrapperVariant(): string {
  const match = BUTTON_SOURCE.match(/\n\s*wrapper:\s*("(?:[^"\\]|\\.)*"|\n\s*"(?:[^"\\]|\\.)*")/);
  expect(match, "не найден вариант `wrapper` в src/components/ui/button.tsx").toBeTruthy();
  return match![1].trim().replace(/^"|"$/g, "");
}

describe("Button variant=wrapper — без хрома", () => {
  it("не объявляет заливку, цвет текста и hover-заливку", () => {
    const classes = readWrapperVariant().split(/\s+/).filter(Boolean);

    const forbidden = classes.filter(
      (c) =>
        /^bg-/.test(c) || // любая заливка, включая `bg-transparent`/`bg-inherit`
        /^text-(?!\[)/.test(c) || // любой цвет/размер текста, кроме произвольного значения
        /^hover:bg-/.test(c)
    );

    expect(
      forbidden,
      `wrapper обязан быть без хрома, иначе он молча перебьёт className вызывающего ` +
        `(порядок в бандле, не в атрибуте). Лишнее: ${forbidden.join(", ")}`
    ).toEqual([]);
  });

  it("сохраняет фокус-кольцо — единственное, что вариант реально даёт", () => {
    const classes = readWrapperVariant();
    expect(classes).toContain("focus-visible:ring-2");
  });

  it("«без хрома» держится на preflight, а не на утилитах: базы это не касается", () => {
    // WRAPPER_BASE отвечает за поведение (переход, disabled, снятие аутлайна) и
    // тоже не должен красить: если заливка переедет туда, пин выше станет
    // вакуумным, потому что смотрит только на строку варианта.
    const base = BUTTON_SOURCE.match(/const WRAPPER_BASE\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/);
    expect(base, "не найден WRAPPER_BASE").toBeTruthy();
    const baseClasses = base![1].split(/\s+/).filter(Boolean);
    expect(baseClasses.filter((c) => /^(bg-|hover:bg-|text-(?!\[))/.test(c))).toEqual([]);
  });
});

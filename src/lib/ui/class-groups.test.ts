import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultUnlessOverridden, overridesGroup } from "@/lib/ui/class-groups";

/**
 * CN-CONFLICT-CLASS — пин механизма и реестр примитивов.
 *
 * Проверяется СВОЙСТВО, а не имена классов: проверка по перечню имён — ровно та
 * ошибка, из-за которой `button-wrapper-chromeless.test.ts` пришлось ужесточать
 * (перечень пропустил бы `bg-inherit`, а `includes("buildConflictScopeWhere")`
 * удовлетворялся строкой импорта).
 */

describe("overridesGroup — семейство, а не список имён", () => {
  it("радиус ловится в любой форме, включая произвольную и осевую", () => {
    for (const cls of ["rounded", "rounded-lg", "rounded-full", "rounded-[14px]", "rounded-t-xl", "p-2 rounded-none"]) {
      expect(overridesGroup(cls, "radius"), cls).toBe(true);
    }
  });

  it("не путает соседние семейства", () => {
    // `rounded` не должен срабатывать на чужих токенах с тем же префиксом,
    // а фон — на `bg-gradient-*`/`bg-brand-*` (это background-image).
    expect(overridesGroup("border-rounded-thing", "radius")).toBe(false);
    expect(overridesGroup("bg-gradient-to-r", "background")).toBe(false);
    expect(overridesGroup("bg-brand-gradient", "background")).toBe(false);
    expect(overridesGroup("bg-inherit", "background")).toBe(true);
  });

  it("оси padding не смешиваются", () => {
    expect(overridesGroup("pt-4", "padding-y")).toBe(true);
    expect(overridesGroup("pt-4", "padding-x")).toBe(false);
    expect(overridesGroup("p-4", "padding-all")).toBe(true);
    // `px-4` — это НЕ «все стороны»: он конфликтует только по своей оси.
    expect(overridesGroup("px-4", "padding-all")).toBe(false);
  });

  it("пустой className ничего не переопределяет", () => {
    expect(overridesGroup(undefined, "radius")).toBe(false);
    expect(overridesGroup("", "radius")).toBe(false);
    expect(defaultUnlessOverridden(undefined, "radius", "rounded-xl")).toBe("rounded-xl");
    expect(defaultUnlessOverridden("rounded-full", "radius", "rounded-xl")).toBeNull();
  });
});

/**
 * Реестр примитивов: перечисляет, КОМУ можно держать жёсткий дефолт в спорной
 * группе и почему. Смысл — не «разрешить», а сделать невозможным молчаливое
 * появление нового: примитив, который принимает `className` и жёстко задаёт
 * спорную группу, обязан либо пройти через `defaultUnlessOverridden`, либо
 * получить здесь строку с обоснованием.
 *
 * ⚠️ Реестр НЕ покрывает латентные коллизии (где вызывающий сегодня побеждает
 * по порядку в бандле) — они перечислены в отчёте CN-CONFLICT-CLASS и в
 * BACKLOG как `CN-MERGE-PROPOSAL`. Здесь только те, где дефолт побеждал.
 */
const HARD_DEFAULTS_ALLOWED: Record<string, string> = {
  "badge.tsx:rounded-full":
    "радиус и рамка — это ФОРМА бейджа, а не оформление: переопределяют их ровно те сайты, которым по SKILL.md §16 полагается вариант, а не override",
  "chip.tsx:rounded-full": "то же — форма пилюли",
  "chip-button.tsx:rounded-full": "то же — форма пилюли",
  "input.tsx:rounded-2xl": "форма поля; вызывающие радиус не трогают (замер: 0 коллизий)",
  "select.tsx:rounded-2xl": "форма поля; 0 коллизий",
  "textarea.tsx:rounded-2xl": "форма поля; 0 коллизий",
  "modal-surface.tsx:rounded-[24px]": "форма модального листа; 0 коллизий",
  "card.tsx:rounded-[24px]": "форма карточки; 0 коллизий",
};

describe("реестр жёстких дефолтов", () => {
  const UI_DIR = path.resolve(__dirname, "..", "..", "components", "ui");

  it("примитивы, где дефолт ПОБЕЖДАЛ, переведены на условный дефолт", () => {
    const fixed = [
      ["Skeleton.tsx", "radius"],
      ["card.tsx", "padding-all"],
      ["badge.tsx", "padding-x"],
      ["badge.tsx", "padding-y"],
    ] as const;

    for (const [file, group] of fixed) {
      const source = readFileSync(path.join(UI_DIR, file), "utf8");
      expect(
        source,
        `${file}: спорная группа "${group}" обязана идти через defaultUnlessOverridden, ` +
          `иначе дефолт снова начнёт молча перебивать вызывающего`,
      ).toContain(`defaultUnlessOverridden(className, "${group}"`);
    }
  });

  it("Skeleton больше не задаёт радиус безусловно", () => {
    const source = readFileSync(path.join(UI_DIR, "Skeleton.tsx"), "utf8");
    // Безусловный радиус — это строка дефолтов, где `rounded-*` стоит рядом с
    // другими утилитами, а не внутри `defaultUnlessOverridden`.
    expect(source).not.toMatch(/"animate-pulse[^"]*\brounded-/);
  });

  it("реестр не протух: каждая запись ссылается на существующий файл и класс", () => {
    for (const key of Object.keys(HARD_DEFAULTS_ALLOWED)) {
      const [file, cls] = key.split(":");
      const source = readFileSync(path.join(UI_DIR, file!), "utf8");
      expect(source, `${key}: класс из реестра исчез из примитива`).toContain(cls!);
    }
  });
});

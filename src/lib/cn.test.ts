import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

/**
 * 29.09 доработки · 12 (CN-MERGE-PROPOSAL) — при конфликте утилит одной группы
 * побеждает ПОСЛЕДНИЙ аргумент `cn`, а не порядок правил в бандле.
 *
 * Случаи семейств выбраны там, где порядок в бандле ОБРАТЕН порядку аргументов
 * (замер `scripts/inventory-cn-conflicts.ts`): при плоском join каждый из них
 * отдаёт победу дефолту примитива, то есть утверждение «последний выигрывает»
 * здесь не может быть зелёным случайно.
 *
 * Токены проекта читаются из самого `tailwind.config.js`: новый ключ тени,
 * фона-картинки, размера шрифта, радиуса или отступа без записи в
 * `extendTailwindMerge` (`cn.ts`) краснеет здесь, а не молча выбрасывается
 * рядом с цветом той же утилиты.
 *
 * @probe 2026-09-29 — (1) из расширения `shadow` в `cn.ts` убран `"card"`:
 *        красный «тень card» — `cn("shadow-card", "shadow-primary/20")` отдал
 *        `"shadow-primary/20"` (тень выброшена как цвет). Возвращено — зелёный.
 *        (2) тело `cn` заменено на `classes.filter(Boolean).join(" ")`: 17 из 20
 *        красные — все шесть семейств (join оставляет оба класса), оба случая
 *        «надо знать автору», все семь теней и оба фона-картинки; зелёными
 *        остались только три случая без конфликта. Возвращено — 20/20.
 */

const require = createRequire(import.meta.url);
type ThemeExtend = Partial<
  Record<
    "boxShadow" | "backgroundImage" | "fontSize" | "borderRadius" | "spacing" | "transitionTimingFunction" | "zIndex",
    Record<string, unknown>
  >
>;
const config = require(resolve(process.cwd(), "tailwind.config.js")) as { theme: { extend: ThemeExtend } };
const extend = config.theme.extend;

function keysOf(section: keyof ThemeExtend): string[] {
  return Object.keys(extend[section] ?? {}).filter((key) => key !== "DEFAULT");
}

describe("cn: побеждает последний аргумент", () => {
  const families: Array<[string, string, string]> = [
    ["радиус", "rounded-xl", "rounded-full"],
    ["отступ по оси", "px-4", "px-3"],
    ["цвет текста", "text-text-main", "text-rose-700"],
    ["высота", "h-11", "h-10"],
    ["фон", "bg-transparent", "bg-bg-card"],
    ["ширина", "w-full", "w-[6.5rem]"],
  ];
  for (const [family, primitive, caller] of families) {
    it(`${family}: ${primitive} → ${caller}`, () => {
      expect(cn(primitive, caller)).toBe(caller);
    });
  }

  it("не трогает авторские классы и классы разных групп", () => {
    expect(cn("lux-input h-11 text-sm", "scrollbar-hide w-24")).toBe("lux-input h-11 text-sm scrollbar-hide w-24");
  });

  it("отбрасывает пустые аргументы", () => {
    expect(cn("p-4", undefined, null, false, "")).toBe("p-4");
  });
});

describe("cn: поведение, которое надо знать автору", () => {
  it("поздний размер шрифта выбрасывает ранний leading-* — leading ставится ПОСЛЕ text-*", () => {
    expect(cn("leading-tight", "text-sm")).toBe("text-sm");
    expect(cn("text-sm", "leading-tight")).toBe("text-sm leading-tight");
  });

  it("p-* вызывающего не снимает адаптивный дефолт — «везде» пишется с брейкпоинтом", () => {
    expect(cn("px-5 pb-5 md:px-6 md:pb-6", "p-5")).toBe("md:px-6 md:pb-6 p-5");
    expect(cn("px-5 pb-5 md:px-6 md:pb-6", "p-5 md:p-5")).toBe("p-5 md:p-5");
  });
});

describe("cn: токены проекта из tailwind.config.js", () => {
  it("конфиг прочитан (иначе проверки ниже вакуумны)", () => {
    expect(keysOf("boxShadow")).toContain("card");
    expect(keysOf("backgroundImage")).toContain("brand-gradient");
  });

  for (const key of keysOf("boxShadow")) {
    it(`тень ${key} — тень, а не цвет тени`, () => {
      expect(cn(`shadow-${key}`, "shadow-primary/20")).toBe(`shadow-${key} shadow-primary/20`);
      expect(cn("shadow-none", `shadow-${key}`)).toBe(`shadow-${key}`);
    });
  }

  for (const key of keysOf("backgroundImage")) {
    it(`фон-картинка ${key} — картинка, а не цвет фона`, () => {
      expect(cn(`bg-${key}`, "bg-bg-card")).toBe(`bg-${key} bg-bg-card`);
      expect(cn("bg-none", `bg-${key}`)).toBe(`bg-${key}`);
    });
  }

  for (const key of keysOf("zIndex")) {
    it(`слой z-${key} — конфликт с z-*`, () => {
      expect(cn("z-10", `z-${key}`)).toBe(`z-${key}`);
      expect(cn(`z-${key}`, "z-auto")).toBe("z-auto");
    });
  }

  for (const key of keysOf("transitionTimingFunction")) {
    it(`кривая ${key} — кривая перехода (конфликт с ease-*)`, () => {
      expect(cn("ease-out", `ease-${key}`)).toBe(`ease-${key}`);
      expect(cn(`ease-${key}`, "ease-linear")).toBe("ease-linear");
    });
  }

  for (const key of keysOf("fontSize")) {
    it(`размер шрифта ${key} — размер, а не цвет текста`, () => {
      expect(cn(`text-${key}`, "text-text-main")).toBe(`text-${key} text-text-main`);
    });
  }

  for (const key of keysOf("borderRadius")) {
    it(`радиус ${key} — в группе радиусов`, () => {
      expect(cn(`rounded-${key}`, "rounded-lg")).toBe("rounded-lg");
    });
  }

  for (const key of keysOf("spacing")) {
    it(`отступ ${key} — в группе отступов`, () => {
      expect(cn(`p-${key}`, "p-4")).toBe("p-4");
    });
  }
});

/**
 * UI-06 — мост между CSS-переменной и классом Tailwind не должен рваться молча.
 *
 * Класс отказа известен проекту (HARDENING-MISC-01): переменная объявлена,
 * моста нет — класс компилируется В НИЧТО. Разметка выглядит правильной,
 * стиля нет, ошибки нет, тесты зелёные. Так жили `text-muted-foreground`
 * (33 сайта, включая `<Badge variant="muted">`) и `text-primary-foreground`.
 *
 * Тест держит обе стороны и одну ловушку:
 *
 *  1) КАЖДЫЙ мост в конфиге ссылается на существующую переменную — иначе
 *     класс есть, а значение пустое (обратное направление того же дефекта);
 *  2) имена, которыми РЕАЛЬНО пользуется разметка, мост имеют — снятие моста
 *     обесцветит живые поверхности;
 *  3) `rose`/`sky` моста НЕ имеют и переменными НЕ объявлены. Это не
 *     недоделка, а защита: в разметке `rose-*`/`sky-*` — встроенные палитры
 *     Tailwind (сотни сайтов статус-бейджей), и ключ `rose` в `extend.colors`
 *     заменил бы всю шкалу целиком. «Достроить мост» здесь означало бы
 *     сломать ровно то, что выглядит починенным.
 *
 * Не-вакуумность: прогонялось со снятым мостом `muted-foreground` (краснеет
 * п. 2), с мостом на несуществующую переменную (п. 1) и с `rose`, добавленным
 * в конфиг (п. 3).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CONFIG = readFileSync(resolve(process.cwd(), "tailwind.config.js"), "utf8");
const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** Тело блока `selector { … }` — от селектора до закрывающей скобки его уровня. */
function varBlock(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  const end = CSS.indexOf("\n  }", start);
  return CSS.slice(start, end);
}

const ROOT = varBlock(":root");

/** Строки конфига без комментариев — иначе в мосты попадут примеры из них. */
const CONFIG_CODE = CONFIG.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Пары «ключ конфига → имя CSS-переменной», как их видит Tailwind. */
function bridges(): { key: string; variable: string }[] {
  const out: { key: string; variable: string }[] = [];
  const re = /["']?([\w-]+)["']?\s*:\s*"rgb\(var\(--([\w-]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CONFIG_CODE)) !== null) out.push({ key: m[1], variable: m[2] });
  return out;
}

describe("UI-06 — мост токен ↔ класс", () => {
  it("каждый мост в конфиге ссылается на объявленную переменную", () => {
    const declared = new Set(
      [...ROOT.matchAll(/--([\w-]+):/g)].map((m) => m[1])
    );
    const dangling = bridges()
      .filter(({ variable }) => !declared.has(variable))
      .map(({ key, variable }) => `${key} → --${variable}`);
    expect(dangling).toEqual([]);
  });

  it("имена, которыми пользуется разметка, мост имеют", () => {
    // Список — из находки UI-06: ровно те, что компилировались в ничто.
    const used = ["muted-foreground", "primary-foreground", "accent-foreground"];
    const keys = new Set(bridges().map((b) => b.key));
    for (const name of used) {
      expect(keys.has(name), `нет моста для ${name}`).toBe(true);
    }
  });

  it("rose/sky остаются встроенными палитрами Tailwind", () => {
    for (const ghost of ["rose", "sky"]) {
      // Мост затёр бы всю встроенную шкалу (`bg-rose-500` и т.п.).
      expect(
        new RegExp(`["']?${ghost}["']?\\s*:\\s*"rgb\\(var\\(`).test(CONFIG_CODE),
        `в конфиге появился ключ ${ghost} — он затрёт встроенную шкалу`
      ).toBe(false);
      // И переменная-призрак не должна вернуться: она внушает, что класс есть.
      expect(new RegExp(`--${ghost}:`).test(CSS), `вернулась переменная --${ghost}`).toBe(false);
    }
  });
});

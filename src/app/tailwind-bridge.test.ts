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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function walkTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walkTsx(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

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
    // `border-control` (UI-09) — тот же класс отказа: снятый мост оставит
    // `border-border-control` в разметке восьми элементов управления и
    // вернёт границы в состояние «компилируется в ничто», то есть в провал
    // WCAG 1.4.11, ради которого токен и заведён.
    const used = [
      "muted-foreground",
      "primary-foreground",
      "accent-foreground",
      "border-control",
      // `accent-text-hover` (UI-10) — снятый мост вернёт три ссылки в
      // состояние «под курсором цвет не меняется вовсе», то есть отменит
      // ровно ту реакцию, ради которой пара и заведена.
      "accent-text-hover",
      // 29.09 доработки · 23 (UI-27): «горящее окошко» и звёзды оценки —
      // снятый мост вернёт их в палитру Tailwind (или в ничто).
      "hot",
      "hot-text",
      "rating",
      "info",
      "decor-primary",
      "decor-magenta",
      // BRAND-ICONS-03: стопы градиента знака (`<LogoMark>`). Снятый мост не
      // обесцветит знак, а молча перекрасит его в цвет текста предка
      // (`currentColor` стопа наследуется) — в шапке это незаметно на глаз.
      "logo-mark-from",
      "logo-mark-via",
      "logo-mark-to",
      "logo-mark-fixed-from",
      "logo-mark-fixed-via",
      "logo-mark-fixed-to",
    ];
    const keys = new Set(bridges().map((b) => b.key));
    for (const name of used) {
      expect(keys.has(name), `нет моста для ${name}`).toBe(true);
    }
  });

  /**
   * UI-07 — тот же класс отказа, но у компонентных классов: разметка их
   * ставит, правила нет. `glass-panel` и `fade-in-up` потерялись вместе с
   * `lux-*` в коммите `68c17f9` (UI-01), `histogram-slider-thumb` не
   * существовал никогда. Ошибки при этом нет ни одной: сайдбар без
   * поверхности и бегунок в дефолтном виде браузера выглядят «как задумано».
   *
   * Не-вакуумность: прогонялось с удалённым `.glass-panel` (краснеет) и с
   * возвращённым `bg-bg-elevated` в разметке (краснеет).
   */
  it("компонентные классы из разметки имеют правило", () => {
    for (const rule of [".glass-panel", ".fade-in-up", ".histogram-slider-thumb"]) {
      expect(CSS.includes(`${rule} `) || CSS.includes(`${rule}:`) || CSS.includes(`${rule}::`), rule)
        .toBe(true);
    }
  });

  it("опечатки в именах токенов не возвращаются в разметку", () => {
    // `bg-bg-elevated` и `border-bg-main` — имена, которых в конфиге нет
    // вовсе: `elevated` и `bg-card` пишутся без второго префикса.
    // `p*-safe` (UI-08) — из плагина `tailwindcss-safe-area`, которого в
    // `plugins: []` нет; safe-area пишется через `var(--safe-area-inset-*)`.
    const offenders = walkTsx("src").filter((file) =>
      /\b(bg-bg-elevated|border-bg-main|p[btlrxy]-safe)\b/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
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

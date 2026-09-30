/**
 * 29.09 доработки · 23 (UI-27) — `dark:`-вилки и палитра Tailwind в строковых
 * литералах только убывают.
 *
 * Тёмная тема встроена в токены (`--success-surface` и т. п. в `globals.css`),
 * поэтому `dark:` в разметке — сигнал недостающего токена, а палитра
 * (`text-red-600`) — цвет мимо палитры продукта: в тёмной теме у одиночного
 * светлого класса нет близнеца. Полноту «где палитра законна» из дерева не
 * вывести (GUARD-INTEGRITY, правило 2) — инвентарь заморожен, сторож краснеет на
 * новом файле, на росте, на снижении (просит обновить FROZEN) и на пропавшем
 * файле.
 *
 * Два счётчика на файл, только по строковым литералам (комментарии компилятор
 * выбрасывает сам): `dark` — вариант `dark:` в любой позиции и обходные формы
 * `[.dark_&]:`, `[.dark &]:`, `group-[.dark]:`, `data-[theme=dark]:`; `palette` —
 * `(bg|text|border|…)-(emerald|red|rose|…)-NNN`. Ратификация — маркер
 * `dark-ok: <причина>` в строке прямо над классом (шкала теплокарты, цвета
 * аватаров, подложка QR): строка под ним в счёт не идёт; маркер без причины или
 * без `dark:`/палитры под ним — красный.
 *
 * Не видит (названы, не ловятся): класс, собранный из частей
 * (`` `text-${tone}-600` ``); цвет, заданный инлайн через `style` (отдельный
 * запрет, дизайн-скилл §2); блоки `.dark {}` в `globals.css` — они законны и
 * сторожем не читаются.
 *
 * @probe 2026-09-30 (по одной оси, `features/reviews/components/review-form.tsx`,
 * className обёртки формы):
 *   1. `dark:text-red-300` → красный: «…/review-form.tsx: dark 1 → 2» и «palette 6 → 7».
 *   2. То же формой `[.dark_&]:text-red-300` → те же два красных.
 *   3. Одиночный `text-red-600` без близнеца → красный «…/review-form.tsx: palette 6 → 7».
 *   4. Пара `text-red-600 dark:text-red-400` переведена на `text-danger-text`, FROZEN
 *      не обновлён → красный: «обновите FROZEN — dark было 1, стало 0» и
 *      «обновите FROZEN — palette было 6, стало 4».
 */
import { describe, expect, it } from "vitest";

import {
  collect,
  darkOverrideFiles,
  diffInventory,
  scanDarkOverrides,
  type DarkCounts,
  type Inventory,
} from "@/lib/testing/ui-inventory";

const KEYS = ["dark", "palette"] as const;

const FROZEN: Inventory<DarkCounts> = {
  // FROZEN:start
  // FROZEN:end
};

describe("машинерия инвентаря dark:/палитры", () => {
  const fixture = [
    "// dark:text-red-300 в комментарии",
    "const x = 1;",
    'const a = "dark:text-red-300";',
    "const b = `${x} dark:bg-emerald-950/40`;",
    'const c = "[.dark_&]:text-red-300";',
    'const d = "hover:dark:bg-rose-950/30";',
    'const e = "text-red-600";',
    'const f = "bg-success-surface text-success-text";',
    "const cfg = { darkMode: \"class\", theme: \"dark\" };",
    "// dark-ok: шкала теплокарты",
    'const g = "bg-rose-100";',
    "// dark-ok: под ним нет палитры",
    'const h = "bg-muted";',
    "export { a, b, c, d, e, f, g, h, cfg };",
  ].join("\n");

  it("считает dark: во всех формах и одиночную палитру; не считает комментарий, токены и строку темы", () => {
    const { counts } = scanDarkOverrides("fixture.ts", fixture);
    // dark: a, b, c, d; palette: a, b, c, d, e (g — под маркером)
    expect(counts).toEqual({ dark: 4, palette: 5 });
  });

  it("маркер снимает строку; маркер без палитры под ним — проблема", () => {
    const { markers } = scanDarkOverrides("fixture.ts", fixture);
    expect(markers).toEqual([{ line: 12, problem: "маркер dark-ok без тёмной вилки или палитры строкой ниже" }]);
  });
});

describe("dark:-вилки и палитра только убывают", () => {
  const { inventory, markerProblems } = collect(darkOverrideFiles(), scanDarkOverrides);

  it("инвентарь совпадает с FROZEN", () => {
    expect(diffInventory(FROZEN, inventory, KEYS)).toEqual([]);
  });

  it("каждый маркер dark-ok с причиной и стоит над dark:/палитрой", () => {
    expect(markerProblems).toEqual([]);
  });
});

/**
 * 29.09 доработки · 22 (UI-26) — сырые `<button>` / `<input>` / `<select>` /
 * `<textarea>` вне `src/components/ui/` только убывают.
 *
 * Полноту «где сырой тег законен» из дерева не вывести (GUARD-INTEGRITY,
 * правило 2), поэтому инвентарь заморожен: сторож краснеет на новом файле, на
 * росте числа, на снижении (просит обновить FROZEN — ремедиация фиксируется
 * здесь же) и на пропавшем файле. Решение владельца 29.09 (22.1): законных
 * сырых сайтов нет — подложки, скрытый выбор файла, ползунок, ловушка для ботов
 * и кнопка `global-error` тоже идут через примитивы (`DismissLayer`,
 * `HiddenFileInput`, `RangeInput`, `HoneypotField`, `BareButton`). Маркер
 * `raw-control-ok: <причина>` в строке прямо над тегом остаётся механизмом
 * посайтовой ратификации на будущее: помеченный сайт в счёт не идёт, маркер без
 * причины или без сырого тега под ним — красный.
 *
 * Разбор — компилятором (`src/lib/testing/ui-inventory.ts`): считает
 * `<button`, любую форму `<X.button` (`m.`, `motion.`), многострочный тег, тег
 * внутри тернарника; не считает `<Button`, `"<button>"` в строке и тег в
 * комментарии.
 *
 * Не видит (названы, не ловятся): `React.createElement("button")`; `role="button"`
 * на `div` — a11y-дефект другого класса; сторонние компоненты, рендерящие
 * `<button>` сами.
 *
 * @probe 2026-09-30 (по одной оси, `features/master/components/services/service-row.tsx`,
 * где до пробы одна сырая кнопка):
 *   1. `<button type="button" onClick={…}>x</button>` над `<ReorderControls` → красный:
 *      «src/features/master/components/services/service-row.tsx: button 1 → 2».
 *   2. Та же вставка формой `<m.button …>` → тот же красный «button 1 → 2».
 *   3. `{/* raw-control-ok: проба *\/}` над `<ReorderControls` (не сырой тег) → красный:
 *      «…/service-row.tsx:36 — маркер raw-control-ok без сырого тега строкой ниже».
 *   4. Сырая кнопка переведена на `<Button`, FROZEN не обновлён → красный на снижении:
 *      «…/service-row.tsx: в инвентаре больше ничего нет — удалите строку из FROZEN»
 *      (при частичном снижении — «обновите FROZEN — button было N, стало M»).
 */
import { describe, expect, it } from "vitest";

import {
  collect,
  diffInventory,
  RAW_TAGS,
  rawControlFiles,
  scanRawControls,
  type Inventory,
  type RawCounts,
} from "@/lib/testing/ui-inventory";

const FROZEN: Inventory<RawCounts> = {
  // FROZEN:start
  // FROZEN:end
};

describe("машинерия инвентаря сырых тегов", () => {
  const fixture = [
    'import { m } from "framer-motion";',
    "export function F({ on }: { on: boolean }) {",
    "  // <button>в комментарии</button>",
    '  const s = "<button>в строке</button>";',
    "  return (",
    "    <div>",
    "      <button type=\"button\">a</button>",
    "      <m.button type=\"button\">b</m.button>",
    "      <button",
    '        type="button"',
    "      >c</button>",
    "      {on ? <input /> : <select />}",
    "      <Button>d</Button>",
    "      {/* raw-control-ok: подложка */}",
    "      <textarea />",
    "      {/* raw-control-ok:   */}",
    "      <input />",
    "      {/* raw-control-ok: под ним нет тега */}",
    "      <Button>e</Button>",
    "      {s}",
    "    </div>",
    "  );",
    "}",
  ].join("\n");

  it("считает сырые теги во всех формах и не считает Button, строки и комментарии", () => {
    const { counts } = scanRawControls("fixture.tsx", fixture);
    // button: обычный + m.button + многострочный; input: тернарник + под пустым маркером
    expect(counts).toEqual({ button: 3, input: 2, select: 1 });
  });

  it("маркер снимает сайт; маркер без причины и без тега под ним — проблема", () => {
    const { markers } = scanRawControls("fixture.tsx", fixture);
    expect(markers).toEqual([
      { line: 16, problem: "маркер raw-control-ok без причины" },
      { line: 18, problem: "маркер raw-control-ok без сырого тега строкой ниже" },
    ]);
  });

  it("дельта: новый файл, рост, снижение, пропавший файл", () => {
    const frozen: Inventory<RawCounts> = { "a.tsx": { button: 2 }, "b.tsx": { input: 1 }, "gone.tsx": { select: 1 } };
    const current: Inventory<RawCounts> = { "a.tsx": { button: 1 }, "b.tsx": { input: 2 }, "new.tsx": { textarea: 1 } };
    expect(diffInventory(frozen, current, RAW_TAGS)).toEqual([
      "a.tsx: обновите FROZEN — button было 2, стало 1",
      "b.tsx: input 1 → 2",
      "new.tsx: новый файл в инвентаре — textarea 1",
      "gone.tsx: в инвентаре больше ничего нет — удалите строку из FROZEN",
    ]);
  });
});

describe("сырые теги вне src/components/ui только убывают", () => {
  const { inventory, markerProblems } = collect(rawControlFiles(), scanRawControls);

  it("инвентарь совпадает с FROZEN", () => {
    expect(diffInventory(FROZEN, inventory, RAW_TAGS)).toEqual([]);
  });

  it("каждый маркер raw-control-ok с причиной и стоит над сырым тегом", () => {
    expect(markerProblems).toEqual([]);
  });
});

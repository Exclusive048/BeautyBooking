/**
 * FIX-D2 (PUBLIC-PROFILE-MOBILE-OVERFLOW) — горизонтальная полоса не должна
 * быть «самозапирающейся»: `min-w-max` и `overflow-x-auto` (или любой другой
 * класс, делающий элемент скролл-контейнером по X) НИКОГДА не стоят на одном
 * элементе.
 *
 * ## Почему это класс, а не стиль
 *
 * `min-width: max-content` запрещает элементу быть у́же своего содержимого, а
 * `min-width` в CSS сильнее `max-width` и сильнее `width`. Значит содержимое
 * такого элемента из него не выпадает никогда, `scrollWidth == clientWidth`,
 * и `overflow-x: auto` на нём мёртв ПО ПОСТРОЕНИЮ — лишняя ширина уезжает не в
 * полосу, а в документ. Легитимного случая нет: если нужна прокрутка, то
 * `min-w-max` обязан стоять на ДОРОЖКЕ внутри контейнера (так и сделаны все
 * остальные полосы проекта — `clients-tabs`, `notifications-tabs`,
 * `filter-chips`, `recent-masters-section`, `studio-masters-carousel`).
 *
 * ## Что стоило
 *
 * `public-profile/master/section-nav.tsx` нёс обе половины на одном элементе.
 * На 375 px `documentElement.scrollWidth` = 459; на телефоне мобильный
 * layout-viewport растягивается до содержимого (459×994 при экране 375×812), и
 * всё `fixed bottom-0` — CTA «Записаться» и нижняя навигация — оказывается за
 * нижней кромкой экрана. Ни один гейт этого не видел: `typecheck` и `lint`
 * смотрят на валидный код, `check:dead-classes` — на классы, у которых есть
 * правило (у обоих оно есть). Живой замер SMOKE-01 прочитал `window.scrollX`
 * (в мобильной эмуляции он 0 ПО ПОСТРОЕНИЮ) и счёл дефект ложным.
 * Замер — `.qa/diagnostics/fix-d2/`.
 *
 * ## Что этот сторож НЕ видит (названо честно)
 *
 *  • переполнение страницы любым ДРУГИМ механизмом (жёсткая `w-[…]`,
 *    `whitespace-nowrap`, таблица без обёртки, декор `absolute` без клипа) —
 *    это поведение, оно живёт в `.qa/no-horizontal-overflow.spec.ts` и
 *    измеряется только браузером;
 *  • `className`, собранный вне атрибута (переменная, проп вызывающего) —
 *    сканер читает только текст самого атрибута `className=…`, зато читает
 *    его ЦЕЛИКОМ, включая все аргументы `cn(...)` и условные ветви внутри
 *    фигурных скобок (одна глубина вложенности) — так что «разнести по двум
 *    строкам `cn`» его не обходит; форма проверена ниже на синтетике.
 *
 * @probe   что сломать (по одному, каждый раз с откатом; выполнено 2026-08-17
 *          против живого дерева, файл возвращён байт-в-байт — `cmp`):
 *   1. вернуть `min-w-max` на скролл-контейнер в `section-nav.tsx` (в точности
 *      дореформенная форма) → 1 failed: «ни один элемент не несёт min-w-max
 *      вместе со своим overflow-x — AssertionError: expected [ Array(1) ] to
 *      deeply equal [] … + "features/public-profile/master/section-nav.tsx:99"»
 *      (строка совпала с `grep -n`);
 *   2. правдоподобная форма обхода — разнести по аргументам:
 *      `className={cn("… overflow-x-auto …", isSticky && "min-w-max")}` →
 *      тот же 1 failed (атрибут читается целиком);
 *   3. вариант брейкпоинта — `md:min-w-max` рядом с `overflow-x-auto` → тот
 *      же 1 failed;
 *   4. форма ВНЕ зоны видимости — `const track = "min-w-max"; …
 *      className={cn(track, "overflow-x-auto …")}` → 3 passed (ЗЕЛЁНЫЙ). Это
 *      названная слепая форма, не дефект пробы; её ловит только `.qa`-спека
 *      `no-horizontal-overflow.spec.ts` — поведением, а не формой.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { stripComments } from "@/lib/testing/source-scan";

const SRC = resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".tsx") && !full.endsWith(".test.tsx") ? [full] : [];
  });
}

/**
 * Каждое вхождение атрибута `className=…` целиком: строковый литерал или всё
 * содержимое фигурных скобок с одной глубиной вложенности (достаточно для
 * `cn("…", cond && "…", { "…": flag })`).
 */
const CLASS_ATTR = /className=(?:"([^"]*)"|'([^']*)'|\{((?:[^{}]|\{[^{}]*\})*)\})/g;

// Префикс варианта (`md:`, `lg:`) допускается: `md:min-w-max` на скроллере
// запирает прокрутку ровно с md — тот же дефект, отложенный до брейкпоинта.
const X_SCROLLER = /(?:^|[\s"'`])(?:[\w-]+:)*(?:overflow-x-(?:auto|scroll)|overflow-(?:auto|scroll))(?=$|[\s"'`])/;
const MIN_W_MAX = /(?:^|[\s"'`])(?:[\w-]+:)*min-w-max(?=$|[\s"'`])/;

export function findSelfDefeatingStrips(source: string): Array<{ line: number; attr: string }> {
  // `stripComments` сохраняет ПЕРЕВОДЫ СТРОК, но не позиции символов (строчный
  // комментарий удаляется, его `\n` остаётся) — поэтому номер строки считается
  // по очищенному тексту, а не по исходнику.
  const clean = stripComments(source);
  const hits: Array<{ line: number; attr: string }> = [];
  for (const m of clean.matchAll(CLASS_ATTR)) {
    const attr = m[1] ?? m[2] ?? m[3] ?? "";
    if (X_SCROLLER.test(attr) && MIN_W_MAX.test(attr)) {
      hits.push({ line: clean.slice(0, m.index ?? 0).split("\n").length, attr });
    }
  }
  return hits;
}

describe("FIX-D2 — полоса не запирает собственную прокрутку", () => {
  it("ни один элемент не несёт min-w-max вместе со своим overflow-x", () => {
    const offenders = walk(SRC).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return findSelfDefeatingStrips(source).map(
        (hit) => `${file.slice(SRC.length + 1).split(sep).join("/")}:${hit.line}`,
      );
    });
    expect(offenders).toEqual([]);
  });

  // Не-вакуумность сторожа доказывается тут же, а не только в @probe:
  // детектор обязан краснеть на дореформенной форме и на её правдоподобном
  // обходе, и НЕ краснеть на правильном split'е и на соседстве, где
  // `min-w-max` стоит на другом элементе.
  it("детектор ловит дореформенную форму и обход через аргументы cn()", () => {
    const original = `<div className="scrollbar-hide flex min-w-max snap-x snap-mandatory gap-1 overflow-x-auto py-1">`;
    const viaCn = `<div className={cn("scrollbar-hide overflow-x-auto snap-x", isOpen && "min-w-max flex gap-1")}>`;
    const bothAxes = `<ul className="min-w-max overflow-auto">`;
    expect(findSelfDefeatingStrips(original)).toHaveLength(1);
    expect(findSelfDefeatingStrips(viaCn)).toHaveLength(1);
    expect(findSelfDefeatingStrips(bothAxes)).toHaveLength(1);
  });

  it("детектор молчит на правильном split'е и на похожих, но других токенах", () => {
    const split = `<div className="-mx-4 overflow-x-auto px-4"><ul className="flex min-w-max gap-1">`;
    const lookalike = `<div className="overflow-x-hidden min-w-max"><span className="overflow-x-auto min-w-[max-content-ish]">`;
    const commented = `<div className="overflow-x-auto" /* min-w-max здесь запрещён */>`;
    expect(findSelfDefeatingStrips(split)).toEqual([]);
    expect(findSelfDefeatingStrips(lookalike)).toEqual([]);
    expect(findSelfDefeatingStrips(commented)).toEqual([]);
  });
});

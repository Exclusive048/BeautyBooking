import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";

import { listSourceFiles, ROOT } from "@/lib/testing/client-graph";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * 29.09 доработки · 24 (UI-20) — форматирование дат, чисел и денег живёт в
 * общих модулях (`UI_FMT` в `lib/ui/fmt.ts` и его соседи). До спеки вне них было
 * 102 вызова `Intl.*` / `toLocale*` в 80 файлах и 13 разных форматтеров денег:
 * «0 ₽» против «—», обычный пробел против неразрывного, четыре конвенции
 * сокращений, а на сервере — даты по часам контейнера.
 *
 * Что считается сайтом (по исходнику без комментариев):
 *  - вызов `Intl.DateTimeFormat` / `Intl.NumberFormat` / `Intl.RelativeTimeFormat`
 *    (с `new` и без);
 *  - вызов `.toLocaleString(` / `.toLocaleDateString(` / `.toLocaleTimeString(`;
 *  - литерал «₽» в коде (строка, шаблон, JSX-текст).
 *
 * Правила:
 *  - вне `ALLOWED` сайтов нет; список перечисляет, КОМУ можно, с причиной;
 *  - «₽» дополнительно разрешён в текстах (`lib/ui/text*`) и в контентных файлах
 *    (`features/<домен>/content/`) — это слова, а не формат;
 *  - в `lib/ui/text*` нет ни `Intl.`, ни `toLocale` (абсолютное правило: тексты
 *    не форматируют — «Итоги недели» ×100 жили именно там);
 *  - `FROZEN` — замороженный остаток по файлам. Он пуст: спека закрыла все
 *    сайты. Новый файл, рост и падение числа — красный (при падении — обновить
 *    `FROZEN`, иначе замороженный долг молча станет разрешением).
 *
 * Слепые формы (осознанно, это зона `npm run check:tz` и ревью):
 *  - ручная сборка времени `${d.getHours()}:${…}` / `padStart`;
 *  - форматтеры сторонних компонентов (`react-day-picker`);
 *  - деньги без «₽» и без `Intl` (`kopeks / 100` прямо в JSX);
 *  - `Intl.DateTimeFormat`, полученный из переменной (`const I = Intl; I.DateTimeFormat(…)`).
 *
 * @probe 2026-10-01 — `new Date().toLocaleDateString("ru-RU")` добавлен в
 * `features/studio-cabinet/reviews/lib/format.ts`: покраснел «вне общих модулей
 * нет форматирования» — лишний сайт `src/features/studio-cabinet/reviews/lib/format.ts
 * : 1` (ожидалось отсутствие файла). Возвращено — зелёный.
 * @probe 2026-10-01 — там же та же дата формой без `new`
 * (`Intl.DateTimeFormat("ru-RU").format(new Date())`): покраснел тот же тест,
 * тот же файл со счётом 1. Возвращено — зелёный.
 * @probe 2026-10-01 — в `lib/ui/text/notifications.ts` рядом с
 * `weeklyStats.body` добавлен ключ `(revenue) => \`${revenue.toLocaleString("ru-RU")} ₽\``
 * (форма, в которой жили «Итоги недели» ×100): покраснели «тексты не
 * форматируют» (сайт `src/lib/ui/text/notifications.ts`) и инвентарь (тот же
 * файл со счётом 1 — «₽» в текстах разрешён, формат нет). Возвращено — зелёный.
 * @probe 2026-10-01 — в `FROZEN` вписан `src/features/home/components/hero-section.tsx: 1`
 * без сайта в файле (форма «заменил сайт, не поправив FROZEN»): покраснел
 * инвентарь — ожидалась запись, которой больше нет. Возвращено — зелёный.
 */

/** Модули, которым форматировать МОЖНО. Не больше восьми — каждый с причиной. */
const ALLOWED: Record<string, string> = {
  "src/lib/ui/fmt.ts": "сам модуль: даты, числа, деньги для интерфейса",
  "src/lib/format.ts": "точные суммы с копейками (moneyRUBFromKopeks) и dateRU биллинга",
  "src/lib/schedule/timezone.ts": "части даты в поясе, ключи дат, проверка пояса",
  "src/lib/ui/zone-label.ts": "смещение зоны для метки «(Город, GMT+N)»",
  "src/lib/time/use-viewer-timezone.ts": "getViewerTimeZone — единственный resolvedOptions()",
};

/** «₽» как слово (не формат): тексты интерфейса и контентные страницы. */
function rubleAllowed(file: string): boolean {
  return (
    file === "src/lib/ui/text.ts" ||
    file.startsWith("src/lib/ui/text/") ||
    /^src\/features\/[^/]+\/content\//.test(file)
  );
}

/** Замороженный остаток: путь → число сайтов. Пуст — спека закрыта. */
const FROZEN: Record<string, number> = {};

const INTL_CALL = /\bIntl\s*\.\s*(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)\s*\(/g;
const LOCALE_CALL = /\.\s*(?:toLocaleString|toLocaleDateString|toLocaleTimeString)\s*\(/g;
const RUBLE = /₽/g;

type SiteCount = { format: number; ruble: number };

/** Сайты в исходнике (комментарии уже вырезаны вызывающим или здесь). */
function countFormatSites(source: string): SiteCount {
  const code = stripComments(source);
  return {
    format: (code.match(INTL_CALL) ?? []).length + (code.match(LOCALE_CALL) ?? []).length,
    ruble: (code.match(RUBLE) ?? []).length,
  };
}

function rel(file: string): string {
  return relative(ROOT, file).split(sep).join("/");
}

function inventory(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of listSourceFiles()) {
    const path = rel(file);
    if (path in ALLOWED) continue;
    const { format, ruble } = countFormatSites(readFileSync(file, "utf8"));
    const total = format + (rubleAllowed(path) ? 0 : ruble);
    if (total > 0) out[path] = total;
  }
  return out;
}

describe("машинерия сторожа — на фиксированной фикстуре", () => {
  it("находит все формы сайта", () => {
    const fixture = [
      'const a = new Intl.DateTimeFormat("ru-RU", { day: "numeric" });',
      'const b = Intl.NumberFormat("ru-RU").format(1);',
      "const c = d.toLocaleString();",
      "const e = x.toLocaleDateString('ru-RU');",
      "const f = y . toLocaleTimeString ( 'ru-RU' );",
      "const g = `${n} ₽`;",
    ].join("\n");
    expect(countFormatSites(fixture)).toEqual({ format: 5, ruble: 1 });
  });

  it("не находит комментарий, PluralRules и строку с именем метода", () => {
    const fixture = [
      "// new Intl.DateTimeFormat() в комментарии",
      "/* x.toLocaleString() и ₽ в блочном комментарии */",
      'const rules = new Intl.PluralRules("ru-RU");',
      'const name = "toLocaleString";',
      "const ok = 1; // хвостовой комментарий с ₽",
    ].join("\n");
    expect(countFormatSites(fixture)).toEqual({ format: 0, ruble: 0 });
  });
});

describe("форматирование — только в общих модулях (UI-20)", () => {
  it("ALLOWED — не больше восьми модулей, у каждого причина", () => {
    expect(Object.keys(ALLOWED).length).toBeLessThanOrEqual(8);
    for (const reason of Object.values(ALLOWED)) expect(reason.trim().length).toBeGreaterThan(0);
  });

  it("вне общих модулей нет форматирования (инвентарь совпадает с FROZEN)", () => {
    // Обход всех исходников — под нагрузкой дольше 5 с.
    expect(inventory()).toEqual(FROZEN);
  }, 30_000);

  it("тексты не форматируют: в lib/ui/text* нет Intl и toLocale", () => {
    const offenders = listSourceFiles()
      .map(rel)
      .filter((path) => path === "src/lib/ui/text.ts" || path.startsWith("src/lib/ui/text/"))
      .filter((path) => countFormatSites(readFileSync(`${ROOT}/${path}`, "utf8")).format > 0);
    expect(offenders).toEqual([]);
  });
});

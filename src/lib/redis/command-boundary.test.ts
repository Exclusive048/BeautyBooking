import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * FIX-C4 — ни одна команда Redis не уходит без верхней границы.
 *
 * ## Почему сторож нужен именно этому классу
 *
 * Дефект найден дважды подряд ЖИВЫМ прогоном и ни разу — тестом
 * (`SMOKE-01 · F2` и `F5`). Он бесшумен по устройству: `redis@5` во время
 * реконнекта не отклоняет команду, а кладёт её в offline-очередь, поэтому
 * `try/catch` инертен, а мок «Redis бросает» зеленеет на сломанном коде.
 * Единственное, что закончит такую команду, — дедлайн вызывающего.
 *
 * ## Почему по ИМПОРТУ, а не по форме вызова
 *
 * 🔴 Прямой урок FIX-C1: там детектор искал вызов
 * `resolveDynamicHotSlotPricing(` и на пробе остался ЗЕЛЁНЫМ — алиас
 * (`const f = …; f({…})`) его обходил. Здесь то же самое было бы ещё легче:
 * `const r = await getRedisConnection(); const c = r.get; await c.call(r, k)`.
 * Импорт — это акт, которым доступ ВЫДАЁТСЯ; получить клиента, не
 * импортировав модуль соединения, нельзя, поэтому обойти нечем.
 *
 * Правило: файл, который берёт клиента (`getRedisConnection` /
 * `getRedisSubscriberConnection`), обязан импортировать и
 * `withRedisCommandTimeout` — либо числиться в реестре с причиной.
 *
 * @probe   ПЕРВАЯ проба провалилась и исправила сторож, а не подтвердила его:
 *          из `api/health/status/route.ts` был убран импорт границы при
 *          сохранённых вызовах — сторож остался ЗЕЛЁНЫМ, потому что искал
 *          идентификатор где угодно. Разобрано: такое состояние ловит
 *          компилятор, а сторож обязан ловить другое.
 *
 *          Итоговая проба: заведён файл `src/lib/redis/_probe-offender.ts`,
 *          берущий клиента и делающий `client.get(key)` без границы —
 *          наблюдалось «файл берёт клиента Redis, но не импортирует границу
 *          команды: src/lib/redis/_probe-offender.ts», красный. Файл удалён,
 *          зелено.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SRC = resolve(PROJECT_ROOT, "src");

const ACQUIRES_CLIENT = /\bgetRedis(?:Subscriber)?Connection\b/;
/**
 * Проверяется УПОМИНАНИЕ границы, и это осознанно шире, чем строка импорта.
 *
 * Проба показала, почему: если искать именно `import … withRedisCommandTimeout`,
 * то удаление импорта при сохранённых вызовах красит сторож — но такое
 * состояние и без него не собирается (`typecheck` падает на неизвестном
 * идентификаторе), то есть сторож дублировал бы компилятор. Использование же
 * без импорта невозможно, поэтому упоминание = доступ к границе.
 *
 * Регрессия, которую сторож реально ловит и которую компилятор пропускает:
 * НОВЫЙ файл берёт клиента и шлёт сырые команды, границу не упоминая вовсе.
 * Именно на ней и выполнена проба (см. `@probe`).
 */
const USES_BOUNDARY = /\bwithRedisCommandTimeout\b/;

/**
 * Кому МОЖНО брать клиента без границы — перечень с причиной, а не перечень
 * проверяемых (приём инв. #25). Новый файл валит тест просто потому, что его
 * здесь нет.
 */
const WAIVED: Record<string, string> = {
  "src/lib/redis/connection.ts": "сам модуль соединения — здесь граница и определена",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.slice(PROJECT_ROOT.length + 1).split(sep).join("/");

/**
 * Комментарии вырезаются ДО поиска, иначе сторож судит по прозе. Поймано
 * пробой: первым нарушителем он объявил `lib/testing/silent-redis.ts` —
 * стенд, который клиента не берёт вовсе, а лишь ОПИСЫВАЕТ механизм в шапке.
 * Хвостовой `// …` после кода не трогается намеренно (урок FIX-C3: шаблон
 * `^[^\n]*?//.*$` сносит строку вместе с её кодом).
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = walk(SRC).map((file) => ({
  rel: rel(file),
  text: stripComments(readFileSync(file, "utf8")),
}));
const acquirers = sources.filter((f) => ACQUIRES_CLIENT.test(f.text));

describe("FIX-C4 · граница команды Redis — на каждом потребителе клиента", () => {
  it("детектор находит потребителей клиента — иначе сторож вакуумен", () => {
    // Порог ниже фактического числа намеренно: он ловит «регексп перестал
    // находить», а не фиксирует инвентарь.
    expect(
      acquirers.length,
      "ни один файл не распознан как берущий клиента Redis — вероятно, " +
        "переименован резолвер и сторож стал no-op",
    ).toBeGreaterThanOrEqual(8);
  });

  it("каждый потребитель импортирует границу команды", () => {
    const offenders = acquirers
      .filter((f) => !(f.rel in WAIVED))
      .filter((f) => !USES_BOUNDARY.test(f.text))
      .map((f) => f.rel);

    expect(
      offenders,
      "файл берёт клиента Redis, но не импортирует границу команды — при " +
        "brownout'е его команда не отклонится и не завершится НИКОГДА " +
        "(`redis@5` кладёт её в offline-очередь), а `try/catch` вокруг " +
        `инертен: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("в реестре нет протухших записей", () => {
    const stale = Object.keys(WAIVED).filter(
      (r) => !acquirers.some((f) => f.rel === r),
    );
    expect(stale, `файл больше не берёт клиента: ${stale.join(", ")}`).toEqual([]);
  });
});

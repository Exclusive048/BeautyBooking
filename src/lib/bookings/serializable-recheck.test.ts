import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * FIX-B11 — недостающая половина сторожа инв. #31.
 *
 * Инвариант #31 состоит из двух частей: (а) work-hours guard в salon-tz и
 * (б) **повторная проверка конфликта ВНУТРИ `$transaction` с
 * `isolationLevel: Serializable`**. Часть (а) покрыта `policy-enforcement.test.ts`,
 * часть (б) не была покрыта НИЧЕМ.
 *
 * 🔴 Как это выяснилось (проба, а не ревью): из `createBooking.ts` — то есть с
 * основного пути создания брони — была удалена строка
 * `{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }`, и **весь
 * прогон остался зелёным: 271 файл / 2271 тест**. Соседний
 * `conflict-scope.test.ts` этого не ловит по построению: он отвечает на вопрос
 * «ЧЬЁ время смотрим» (инв. #11), а не «под какой изоляцией». Ровно тот класс,
 * ради которого заведён инв. #43: статус «guard-backed» означал «вероятно», а
 * не «проверено».
 *
 * Почему именно `Serializable`, а не просто транзакция: повторная проверка
 * читает ЧУЖИЕ брони и коммитит свою. Под Read Committed две параллельные
 * транзакции обе читают «пусто» и обе коммитятся — то есть re-check внутри
 * транзакции без Serializable не даёт ничего сверх проверки снаружи, а выглядит
 * как защита. Отказ приходит на коммите (P2034) и превращается в 409
 * `SLOT_CONFLICT`.
 *
 * ⚠️ Семья выводится, а не перечисляется: сканируется всё дерево на форму
 * `ensureNoConflicts…(tx` — то есть на *re-check внутри транзакции*. Новый путь
 * записи брони попадает под правило автоматически; список имён здесь бы протух
 * ровно так же, как протухали списки в #35/#38.
 *
 * @probe   что сломать: удалить строку `{ isolationLevel: … Serializable }` из
 *          `lib/bookings/createBooking.ts`.
 *          наблюдалось: «путь берёт re-check в транзакции, но без Serializable:
 *          src/lib/bookings/createBooking.ts» — красный.
 *          восстановлено, `git diff` пуст, зелено.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SRC = resolve(PROJECT_ROOT, "src");

/** Re-check внутри транзакции: клиент — `tx`, а не `prisma`. */
const IN_TX_RECHECK = /ensureNoConflicts\w*\(\s*tx\b/;
const SERIALIZABLE = /isolationLevel:\s*Prisma\.TransactionIsolationLevel\.Serializable/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const recheckFiles = walk(SRC)
  .filter((file) => IN_TX_RECHECK.test(readFileSync(file, "utf8")))
  .map((file) => file.slice(PROJECT_ROOT.length + 1).split(sep).join("/"))
  .sort();

describe("инв. #31 · re-check конфликта идёт под Serializable", () => {
  it("детектор находит семью — иначе сторож вакуумен", () => {
    // Пути записи брони с in-tx re-check: funnel, solo manual, solo package,
    // studio package. Порог ниже фактического числа намеренно — он ловит
    // «регексп перестал находить», а не фиксирует инвентарь.
    expect(
      recheckFiles.length,
      "ни один файл не распознан как делающий re-check внутри транзакции — " +
        "скорее всего, изменилась форма вызова и сторож стал no-op",
    ).toBeGreaterThanOrEqual(4);
  });

  it("каждый путь с in-tx re-check объявляет Serializable", () => {
    const unguarded = recheckFiles.filter(
      (rel) => !SERIALIZABLE.test(readFileSync(resolve(PROJECT_ROOT, rel), "utf8")),
    );

    expect(
      unguarded,
      "путь берёт re-check в транзакции, но без Serializable — под Read Committed " +
        "обе параллельные транзакции читают «пусто» и обе коммитятся, то есть re-check " +
        "не даёт ничего сверх внешней проверки (инв. #31): " + unguarded.join(", "),
    ).toEqual([]);
  });

  it("re-check стоит именно внутри транзакции, а не только снаружи", () => {
    // Вторая форма дефекта: оставить `ensureNoConflicts(prisma, …)` до
    // транзакции и убрать повторный вызов внутри. Тогда предыдущий тест
    // проходит (Serializable на месте), а гарантии нет — коммит не перечитает
    // конфликт. Поэтому у каждого пути обязаны быть ОБА вызова.
    const missingOuterOrInner = recheckFiles.filter((rel) => {
      const source = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      return !/ensureNoConflicts\w*\(\s*prisma\b/.test(source);
    });

    expect(
      missingOuterOrInner,
      "у пути есть in-tx re-check, но нет дешёвой предварительной проверки — " +
        "либо форма вызова изменилась, либо путь потерял половину дисциплины: " +
        missingOuterOrInner.join(", "),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/**
 * LOGIC-16 — пересчёт рейтинга цели отзыва читает агрегат и пишет его в строку
 * провайдера, то есть это read-modify-write. Транзакции шли с изоляцией по
 * умолчанию (Read Committed), где вторая не видит незакоммиченный
 * `review.create` первой: она считала `count = N+1` вместо `N+2` и писала это
 * поверх. Потеря обновления не самозалечивается — до следующего отзыва
 * публичный профиль показывает заниженное число.
 *
 * Фикс — `SELECT … FOR UPDATE` на строке провайдера ДО агрегата. Тест сторожит
 * ровно те два условия, без которых фикс перестаёт работать:
 *
 *  1. писатель ОДИН. Копий было три (`reviews/service.ts` и два админских), и
 *     блокировка в одной из трёх не серилизует ничего — тот, кто её не берёт,
 *     затирает свободно. Заодно копии успели разойтись: админские глотали
 *     отказ записи голым `catch {}` и не трогали `Studio` вовсе;
 *  2. блокировка стоит ДО агрегата. После агрегата она бессмысленна — цифра
 *     к этому моменту уже посчитана по старому снимку (именно так и работал
 *     собственный lock у `provider.update`).
 */

const SRC_ROOT = resolve(process.cwd(), "src");
const PRIMITIVE = "src/lib/reviews/recalculate-ratings.ts";

/** Поля, которыми выражается агрегат рейтинга цели отзыва. */
// `[^}]` уже покрывает переводы строк, флаг `s` не нужен (и недоступен на
// текущем target).
const RATING_WRITE = /data:\s*\{[^}]*\bratingCount\b/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("recalculateTargetRatings — LOGIC-16", () => {
  it("блокировка строки провайдера берётся ДО агрегата", () => {
    const source = readFileSync(resolve(process.cwd(), PRIMITIVE), "utf8");
    // Якорь — сам оператор, а не фраза «FOR UPDATE»: она встречается ещё и в
    // doc-комментарии выше по файлу, и поиск по ней сделал бы проверку
    // порядка вакуумной (комментарий всегда идёт первым).
    const lock = source.indexOf("tx.$queryRaw");
    const aggregate = source.indexOf("tx.review.aggregate");
    const write = source.indexOf("tx.provider.update");

    expect(lock).toBeGreaterThan(-1);
    expect(source.slice(lock, aggregate > lock ? aggregate : source.length)).toContain(
      "FOR UPDATE"
    );
    expect(aggregate).toBeGreaterThan(lock);
    expect(write).toBeGreaterThan(aggregate);
  });

  it("рейтинг цели пишет ровно один модуль", () => {
    const writers = walk(SRC_ROOT)
      .filter((file) => RATING_WRITE.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split(sep).join("/"));

    expect(writers).toEqual([PRIMITIVE]);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOGIC-06 — подтверждение модель-оффера было пятым, форкнутым путём создания
 * брони: оно копировало тело проверки конфликтов, но НЕ звало
 * `assertNoTimeBlockConflict`. `FIX-TIMEBLOCK-ENFORCEMENT-01` объявляет этот
 * guard «ONE primitive reused at every create/move site» — и этот сайт был
 * единственным пропущенным.
 *
 * Цена: бронь садилась внутрь объявленного отсутствия мастера (BREAK/BLOCK) —
 * мастер видел в календаре блок и бронь поверх него.
 *
 * Перечислять сайты руками бессмысленно (пятый появился именно так), поэтому
 * guard обходит дерево: файл, который СОЗДАЁТ или ПЕРЕНОСИТ бронь, обязан
 * спросить о блоках — сам или через `ensureNoConflicts`, который его включает.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
}

function walk(relDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(PROJECT_ROOT, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...walk(rel));
      continue;
    }
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/**
 * Сайт записи брони: создание строки `Booking` с временем.
 *
 * FIX-C1 сменил каноническую форму — строку теперь вставляет единственный writer
 * `createBookingRow` (`lib/bookings/booking-row.ts`), который выводит
 * `Booking.studioId` из поверхности. Сырая форма оставлена в детекторе НАМЕРЕННО:
 * если кто-то вернёт прямой `booking.create`, этот guard обязан продолжать
 * считать его путём создания, а не потерять из виду. Запрет самой сырой формы —
 * предмет соседнего сторожа (`bookings/booking-studio-scope.test.ts`), и эти два
 * правила намеренно независимы.
 */
const CREATES_BOOKING = /createBookingRow\(|booking\.create\(\{/;

const WAIVED: Record<string, string> = {
  // Пакетные создатели зовут `ensureNoConflicts` покомпонентно — guard внутри
  // него; отдельная проверка была бы второй, не первой.
  "src/lib/bookings/package-booking.ts": "покомпонентный ensureNoConflicts",
  "src/lib/bookings/package-booking-studio.ts": "покомпонентный ensureNoConflicts",
  // FIX-C1: writer — это МЕХАНИЗМ вставки, а не путь записи. Он не знает ни
  // окна, ни буфера, ни мастера-владельца блока и обязан не знать: политику
  // держат вызывающие. Свойство guard'а от этого не слабеет — каждый файл,
  // зовущий `createBookingRow`, детектор по-прежнему видит и проверяет.
  "src/lib/bookings/booking-row.ts": "единственный writer строки; политику проверяют вызывающие",
};

describe("LOGIC-06 · guard объявленного отсутствия — на каждом пути записи", () => {
  const creators = walk("src").filter((rel) => CREATES_BOOKING.test(read(rel)));

  it("обход находит известные пути создания брони", () => {
    expect(creators).toContain("src/lib/bookings/createBooking.ts");
    expect(creators).toContain(
      "src/app/api/model-applications/[applicationId]/confirm/route.ts",
    );
  });

  it("каждый путь спрашивает о блоках — сам или через ensureNoConflicts", () => {
    // Именно ВЫЗОВ, а не упоминание идентификатора: комментарий рядом с
    // guard'ом содержит его имя, и проверка через `includes` считала бы
    // закомментированный или удалённый guard живым.
    const CALLS_GUARD = /await assertNoTimeBlockConflict\(/;
    const CALLS_ENSURE = /await ensureNoConflicts\(/;

    const unguarded = creators.filter((rel) => {
      if (rel in WAIVED) return false;
      const text = read(rel);
      return !CALLS_GUARD.test(text) && !CALLS_ENSURE.test(text);
    });
    expect(
      unguarded,
      `Путь создаёт бронь и не проверяет TimeBlock — бронь сядет внутрь ` +
        `объявленного отсутствия мастера: ${unguarded.join(", ")}`,
    ).toEqual([]);
  });

  it("в списке исключений нет протухших путей", () => {
    const stale = Object.keys(WAIVED).filter((rel) => !creators.includes(rel));
    expect(stale, `Пути больше не создают брони: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("LOGIC-06 · владелец блока определяется одинаково", () => {
  it("модель-оффер использует ту же формулу, что `ensureNoConflicts`", () => {
    const route = read("src/app/api/model-applications/[applicationId]/confirm/route.ts");
    const core = read("src/lib/bookings/booking-core.ts");
    // `masterProviderId ?? providerId` — расхождение здесь означало бы, что
    // один и тот же блок для двух путей принадлежит разным мастерам
    expect(core).toMatch(/masterProviderId:\s*input\.masterProviderId \?\? input\.providerId/);
    expect(route).toMatch(
      /masterProviderId:\s*application\.offer\.masterId \?\? offerService\.providerId/,
    );
  });
});

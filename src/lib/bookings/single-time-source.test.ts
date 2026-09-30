import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * BOOKING-TIME-COLUMNS-01 — у брони ОДИН источник времени.
 *
 * `Booking.startAt` / `Booking.endAt` жили рядом с канонической UTC-парой
 * `startAtUtc`/`endAtUtc` (инв. #1, CLAUDE.md rule 8) и были удалены: все
 * 12 write-путей писали обе пары из одного выражения, функциональных
 * читателей не было, а 101 строка из 167 уже имела `startAt = NULL` без
 * единого последствия. Дубликат не «разошёлся» только потому, что никто ни
 * разу не забыл вторую строчку — держать инвариант на дисциплине, когда его
 * можно держать на схеме, незачем.
 *
 * Тест пинит результат ДВУМЯ слоями, потому что каждый ловит своё:
 *
 *   1. **Schema-level** — в `prisma/schema/booking.prisma` модели `Booking`
 *      не должно быть полей `startAt`/`endAt`. Ловит попытку вернуть
 *      колонку (в т.ч. случайным `migrate dev` после ручной правки схемы).
 *
 *   2. **Source-level** — ни один write-путь не должен слать `startAt:` /
 *      `endAt:` в Prisma-payload брони. Prisma-клиент такой ключ сегодня
 *      отвергает в рантайме, но рантайм-отказ находится в проде, а этот
 *      тест — в CI. Сиды показали, почему это нужно: они лежат ВНЕ `src/`
 *      и первую ревизию правки пережили нетронутыми.
 *
 * ⚠️ Что тест НЕ трогает и трогать не должен:
 *   • `TimeBlock.startAt/endAt` и `ScheduleBreak` — их СОБСТВЕННЫЕ
 *     канонические колонки;
 *   • `Booking.proposedStartAt/proposedEndAt` — предложение переноса,
 *     отдельная сущность (инв. #32).
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

describe("BOOKING-TIME-COLUMNS-01 — единственный источник времени брони", () => {
  it("модель Booking не содержит legacy-полей startAt/endAt", () => {
    const schema = readFileSync(
      resolve(PROJECT_ROOT, "prisma/schema/booking.prisma"),
      "utf8",
    );
    const model = /model Booking \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model, "модель Booking не найдена в booking.prisma").not.toBe("");

    const fieldNames = model
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/)[0]);

    expect(fieldNames).not.toContain("startAt");
    expect(fieldNames).not.toContain("endAt");
    // Канон на месте — тест не должен «проходить» на пустой модели.
    expect(fieldNames).toContain("startAtUtc");
    expect(fieldNames).toContain("endAtUtc");
  });

  it("ни один booking-write не шлёт legacy-пару в Prisma-payload", () => {
    // Сиды — ВНЕ `src/`; именно там пережил первую ревизию последний
    // legacy-write, поэтому область обхода шире, чем кажется нужным.
    const ROOTS = ["src", "prisma/seeds", "scripts"];
    const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "generated"]);

    const files: string[] = [];
    const walk = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return; // необязательный корень (напр. scripts/) — не повод падать
      }
      for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (!SKIP_DIRS.has(entry)) walk(full);
        } else if (/\.(ts|tsx|mts|mjs)$/.test(entry)) {
          files.push(full);
        }
      }
    };
    for (const root of ROOTS) walk(resolve(PROJECT_ROOT, root));
    expect(files.length).toBeGreaterThan(100); // обход реально что-то нашёл

    // Опознаём payload ПО ФОРМЕ, а не по вызову. Якорь на
    // `prisma.booking.create(` не годится: в сидах payload лежит в отдельном
    // `const data = {…}` ПЕРЕД вызовом — то есть ровно те сайты, которые
    // реально сломались, forward-скан от вызова бы и пропустил.
    //
    // Признак booking-payload'а — `startAtUtc:` рядом с полем, которое есть
    // ТОЛЬКО у брони. Это отсекает три легитимные категории: `where`-клаузы
    // TimeBlock (`startAt: { lt: … }`), DTO-объявления и имена аргументов.
    const BOOKING_ONLY_MARKERS = [
      /\bslotLabel\s*:/,
      /\bclientPhoneSnapshot\s*:/,
      /\bsource\s*:\s*BookingSource\b/,
    ];
    const RADIUS = 25;

    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith("single-time-source.test.ts")) continue;
      const source = readFileSync(file, "utf8");
      if (!source.includes("startAtUtc")) continue;
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!/^\s+(startAt|endAt)\s*[,:]/.test(line)) return;
        const window = lines.slice(Math.max(0, index - RADIUS), index + RADIUS + 1).join("\n");
        // `[,:\n]`, а не только `:` — в `src/` канон пишется шорткатом
        // (`startAtUtc,`), и вариант с двоеточием опознавал такие payload'ы
        // только по случайному соседству с колоночной формой выше по файлу.
        if (!/\bstartAtUtc\s*[,:\n]/.test(window)) return;
        if (!BOOKING_ONLY_MARKERS.some((marker) => marker.test(window))) return;
        offenders.push(`${file.replace(PROJECT_ROOT, "").slice(1)}:${index + 1} — ${line.trim()}`);
      });
    }

    expect(offenders, `legacy-пара вернулась в booking-payload:\n${offenders.join("\n")}`).toEqual([]);
  });
});

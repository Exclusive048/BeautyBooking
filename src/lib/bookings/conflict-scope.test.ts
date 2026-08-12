import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { buildConflictScopeWhere, buildConflictWindowWhere } from "@/lib/bookings/booking-core";

/**
 * LOGIC-01 — предикат конфликта ключевался ПАРОЙ `(providerId, masterProviderId)`,
 * а один и тот же мастер имеет брони под ДВУМЯ разными `providerId`:
 *
 *   личный профиль  → providerId = мастер,        masterProviderId = мастер
 *   студийный кабинет → providerId = студия,      masterProviderId = мастер
 *
 * Множества не пересекались, поэтому админ студии создавал бронь поверх
 * существующей БЕЗ гонки, а Serializable этого не ловил (транзакции читают
 * непересекающиеся строки — цикла зависимостей нет).
 *
 * Тест проверяет две вещи, которые ломаются независимо: (1) сам предикат
 * покрывает обе стороны и остаётся НАДМНОЖЕСТВОМ прежнего; (2) все места, где
 * конфликт ищется, действительно берут скоуп из общего билдера — иначе
 * следующая копия молча вернёт дефект.
 */

type ScopeWhere = { OR: Array<Record<string, unknown>> };

const MASTER = "provider-master";
const STUDIO = "provider-studio";

function clauses(where: ScopeWhere): string[] {
  return where.OR.map((clause) => JSON.stringify(clause));
}

describe("buildConflictScopeWhere — LOGIC-01", () => {
  it("бронь студии видит брони мастера с его личного профиля", () => {
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER,
    }) as ScopeWhere;

    // ключ — исполнитель, а не пара; личная бронь имеет тот же masterProviderId
    expect(clauses(where)).toContain(JSON.stringify({ masterProviderId: MASTER }));
  });

  it("бронь с личного профиля видит брони того же мастера в студии", () => {
    const where = buildConflictScopeWhere({
      providerId: MASTER,
      masterProviderId: MASTER,
    }) as ScopeWhere;

    expect(clauses(where)).toContain(JSON.stringify({ masterProviderId: MASTER }));
  });

  it("скоуп больше не привязан к providerId, под которым создана бронь", () => {
    const fromStudio = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER,
    }) as ScopeWhere;
    const fromPersonal = buildConflictScopeWhere({
      providerId: MASTER,
      masterProviderId: MASTER,
    }) as ScopeWhere;

    // обе стороны спрашивают об ОДНОМ ресурсе — времени мастера
    expect(clauses(fromStudio)).toEqual(clauses(fromPersonal));
  });

  it("бронь без назначенного мастера сохраняет ПРЕЖНИЙ широкий скоуп", () => {
    // сузить его — отдельное продуктовое решение, а не побочный эффект фикса
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: null,
    }) as ScopeWhere;

    expect(clauses(where)).toContain(JSON.stringify({ providerId: STUDIO }));
    expect(clauses(where)).toContain(
      JSON.stringify({ masterProviderId: null, providerId: STUDIO }),
    );
  });

  it("бронь мастера не конфликтует с бронями ЧУЖОГО мастера", () => {
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER,
    }) as ScopeWhere;

    const serialized = JSON.stringify(where);
    expect(serialized).not.toContain("provider-other");
    // и не превращается в «все брони студии»
    expect(clauses(where)).not.toContain(JSON.stringify({ providerId: STUDIO }));
  });
});

/**
 * Вторая половина: копий предиката было ЧЕТЫРЕ, и каждая несла собственный
 * скоуп — именно поэтому дефект и прожил. Перечислять копии руками бессмысленно
 * (список протухнет ровно так же), поэтому guard обходит дерево: каждый файл,
 * который ИЩЕТ пересечение броней, обязан либо брать скоуп из общего билдера,
 * либо числиться в `NON_CONFLICT_READERS` с причиной, почему он не конфликт-
 * проверка. Пятая копия в новом файле не пройдёт CI.
 */
describe("LOGIC-01 · пятая копия скоупа не пройдёт молча", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

  /** Подпись конфликт-запроса: активные брони, пересекающие окно. */
  const ACTIVE_BOOKING_FILTER = 'notIn: ["REJECTED", "CANCELLED", "NO_SHOW"]';

  /**
   * Файлы, где этот фильтр означает ЧТЕНИЕ (календарь, витрина, аналитика,
   * пересчёт доступности), а не проверку конфликта перед записью.
   */
  /**
   * Признак КОНФЛИКТ-АРИФМЕТИКИ, а не выборки: файл сам сравнивает интервалы.
   * Читающие поверхности (календарь, CRM, витрина) отдают строки как есть и
   * пересечений не считают — проверено на всех восьми исключениях: `overlaps(`
   * встречается ровно в одном файле, и это тот, где пряталась пятая копия.
   */
  const OVERLAP_ARITHMETIC = "overlaps(";

  /**
   * Файлы, где этот фильтр означает ЧТЕНИЕ (календарь, витрина, аналитика,
   * пересчёт доступности), а не проверку конфликта перед записью.
   *
   * 🔴 Исключение ФАЙЛОВОЕ, и в этом была дыра: `usecases.ts` числился здесь
   * как «чтение списков броней», а рядом, в том же файле, жил
   * `ensureNoConflictsExcluding` со СТАРЫМ парным скоупом — одна легитимная
   * выборка амнистировала весь файл, и пятая копия прошла молча. Поэтому
   * запись в этом списке теперь обязана быть чистой от `overlaps(` (тест ниже).
   */
  const NON_CONFLICT_READERS: Record<string, string> = {
    "src/app/api/cabinet/master/schedule/route.ts": "чтение расписания кабинета",
    "src/lib/master/clients.service.ts": "CRM-выборка клиентов мастера",
    "src/lib/master/day.service.ts": "день мастера на экране",
    "src/lib/master/public-profile-view.service.ts": "публичный профиль",
    "src/lib/schedule/available-today.ts": "пересчёт availableToday",
    "src/lib/schedule/usecases.ts": "генератор слотов — сам источник правила скоупа",
    "src/lib/studio/clients.service.ts": "CRM-выборка клиентов студии",
  };

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

  const candidates = walk("src").filter((rel) =>
    readFileSync(resolve(PROJECT_ROOT, rel), "utf8").includes(ACTIVE_BOOKING_FILTER),
  );

  it("обход что-то находит — иначе guard вакуумный", () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("каждая поверхность либо на общем скоупе, либо явно не конфликт-проверка", () => {
    const unclassified = candidates.filter((rel) => {
      if (rel in NON_CONFLICT_READERS) return false;
      return !readFileSync(resolve(PROJECT_ROOT, rel), "utf8").includes("buildConflictScopeWhere");
    });

    expect(
      unclassified,
      `Файл ищет активные брони и не берёт скоуп из buildConflictScopeWhere. ` +
        `Если это проверка конфликта — используйте общий билдер (иначе вернётся LOGIC-01). ` +
        `Если чтение — впишите путь и причину в NON_CONFLICT_READERS: ${unclassified.join(", ")}`,
    ).toEqual([]);
  });

  it("в списке чтений нет протухших путей", () => {
    const stale = Object.keys(NON_CONFLICT_READERS).filter((rel) => !candidates.includes(rel));
    expect(stale, `Пути больше не читают активные брони: ${stale.join(", ")}`).toEqual([]);
  });

  it("исключение-«чтение» не считает пересечений — иначе оно прячет проверку", () => {
    const arithmetic = Object.keys(NON_CONFLICT_READERS).filter((rel) =>
      readFileSync(resolve(PROJECT_ROOT, rel), "utf8").includes(OVERLAP_ARITHMETIC),
    );

    expect(
      arithmetic,
      `Файл объявлен читающим, но сам сравнивает интервалы (${OVERLAP_ARITHMETIC}) — ` +
        `значит в нём есть проверка конфликта, и файловое исключение её амнистирует. ` +
        `Именно так пятая копия скоупа пережила LOGIC-01 в usecases.ts. ` +
        `Переведите проверку на buildConflictScopeWhere и уберите файл из списка: ${arithmetic.join(", ")}`,
    ).toEqual([]);
  });

  it("все пять бывших копий переведены на общий скоуп", () => {
    for (const rel of [
      "src/lib/bookings/booking-core.ts",
      "src/lib/bookings/confirmBooking.ts",
      "src/lib/studio/bookings.service.ts",
      "src/app/api/model-applications/[applicationId]/confirm/route.ts",
      // пятая — найдена уже после LOGIC-01, на пути предложения переноса
      "src/lib/bookings/usecases.ts",
    ]) {
      const source = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      // 🔴 Форма ВЫЗОВА, а не наличие имени: проверка `includes("buildConflictScopeWhere")`
      // была вакуумной — её удовлетворяли строка импорта и упоминание в комментарии,
      // поэтому файл с возвращённым парным скоупом проходил guard зелёным (поймано
      // пробой при доделке FIX-A2).
      expect(source, `${rel}: скоуп обязан БРАТЬСЯ из общего билдера, а не только импортироваться`)
        .toContain("buildConflictScopeWhere(");
    }
  });
});

/**
 * LOGIC-17 — скоуп отвечает «чьё это время», окно — «за какой отрезок смотрим».
 * Второго не было вовсе у обоих студийных путей: `findMany` без `lt`/`gt`
 * забирает ВСЮ историю броней мастера. Помимо стоимости, внутри Serializable
 * это ставит predicate-lock на всю историю — параллельная запись брони того же
 * мастера, хоть на следующий год, становится кандидатом на P2034 и получает
 * ложный 409 `SLOT_CONFLICT`, и частота таких ложных конфликтов растёт линейно
 * с историей кабинета.
 *
 * Опасность сужения запроса — потерять конфликт. Поэтому тест сверяет предикат
 * БД с предикатом в памяти на границах: они обязаны отбирать одно и то же.
 */
describe("buildConflictWindowWhere — LOGIC-17", () => {
  const start = new Date("2026-08-12T10:00:00.000Z");
  const end = new Date("2026-08-12T11:00:00.000Z");

  /** Тот же расчёт, что делает `.some(...)` в studio/bookings.service.ts. */
  function overlapsInMemory(rowStart: Date, rowEnd: Date, bufferMin: number): boolean {
    const itemStart = bufferMin ? new Date(rowStart.getTime() - bufferMin * 60_000) : rowStart;
    const itemEnd = bufferMin ? new Date(rowEnd.getTime() + bufferMin * 60_000) : rowEnd;
    return start < itemEnd && end > itemStart;
  }

  function matchesWindow(rowStart: Date, rowEnd: Date, bufferMin: number): boolean {
    const where = buildConflictWindowWhere({ startAtUtc: start, endAtUtc: end, bufferMin });
    return rowStart < where.startAtUtc.lt && rowEnd > where.endAtUtc.gt;
  }

  const cases: Array<{ name: string; rowStart: string; rowEnd: string }> = [
    { name: "точно накрывает", rowStart: "2026-08-12T10:30:00Z", rowEnd: "2026-08-12T11:30:00Z" },
    { name: "встык до", rowStart: "2026-08-12T09:00:00Z", rowEnd: "2026-08-12T10:00:00Z" },
    { name: "встык после", rowStart: "2026-08-12T11:00:00Z", rowEnd: "2026-08-12T12:00:00Z" },
    { name: "за буфером до", rowStart: "2026-08-12T08:00:00Z", rowEnd: "2026-08-12T09:30:00Z" },
    { name: "за буфером после", rowStart: "2026-08-12T11:20:00Z", rowEnd: "2026-08-12T12:00:00Z" },
    { name: "далеко в прошлом", rowStart: "2025-01-01T10:00:00Z", rowEnd: "2025-01-01T11:00:00Z" },
    { name: "далеко в будущем", rowStart: "2027-01-01T10:00:00Z", rowEnd: "2027-01-01T11:00:00Z" },
  ];

  for (const bufferMin of [0, 15]) {
    for (const item of cases) {
      it(`${item.name} · буфер ${bufferMin} — БД и память согласны`, () => {
        const rowStart = new Date(item.rowStart);
        const rowEnd = new Date(item.rowEnd);
        expect(matchesWindow(rowStart, rowEnd, bufferMin)).toBe(
          overlapsInMemory(rowStart, rowEnd, bufferMin),
        );
      });
    }
  }

  it("история за пределами окна в выборку не попадает", () => {
    const where = buildConflictWindowWhere({ startAtUtc: start, endAtUtc: end, bufferMin: 0 });
    const lastYearStart = new Date("2025-01-01T10:00:00Z");
    const lastYearEnd = new Date("2025-01-01T11:00:00Z");
    expect(lastYearStart < where.startAtUtc.lt && lastYearEnd > where.endAtUtc.gt).toBe(false);
  });

  it("оба студийных пути фильтруют окно, а не читают историю целиком", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/studio/bookings.service.ts"),
      "utf8",
    );
    // Два вызова — create и move.
    expect(source.match(/buildConflictWindowWhere\(/g)?.length).toBe(2);
    // Прежняя безоконная форма не должна вернуться.
    expect(source).not.toMatch(/startAtUtc:\s*\{\s*not:\s*null\s*\},/);
  });
});

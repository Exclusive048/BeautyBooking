import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { buildConflictScopeWhere } from "@/lib/bookings/booking-core";

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
  const NON_CONFLICT_READERS: Record<string, string> = {
    "src/app/api/cabinet/master/schedule/route.ts": "чтение расписания кабинета",
    "src/lib/bookings/usecases.ts": "чтение списков броней",
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

  it("все четыре бывшие копии переведены на общий скоуп", () => {
    for (const rel of [
      "src/lib/bookings/booking-core.ts",
      "src/lib/bookings/confirmBooking.ts",
      "src/lib/studio/bookings.service.ts",
      "src/app/api/model-applications/[applicationId]/confirm/route.ts",
    ]) {
      const source = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      expect(source, rel).toContain("buildConflictScopeWhere");
    }
  });
});

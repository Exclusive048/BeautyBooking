import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildOccupancyBookingWhere,
  normalizeOccupancyIds,
  resolveOccupancyProviderIds,
} from "@/lib/schedule/occupancy";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * STUDIO-MASTER-PROFILES (этап 1, решение владельца 2026-09-27): единица
 * записи — профиль, но время у человека одно. Занятое в одном профиле мастера
 * (личном или в студии) недоступно в другом.
 *
 * Две половины, которые ломаются независимо: (1) набор профилей выводится
 * правильно; (2) каждое место, где считается «свободно ли время», идёт через
 * этот набор, а не через один профиль — иначе второй профиль молча начнёт
 * продавать время, занятое в первом.
 *
 * @probe   A/B на половине (2): в `schedule/free-slot-keys.ts` занятость
 *          возвращена к форме на один профиль —
 *          `OR: [{ masterProviderId: provider.id }, { masterProviderId: null,
 *          providerId: provider.id }]` (буквально то, что там было до этапа 1).
 *          → «места с занятостью на один профиль» 1 failed, файл назван.
 *          Вторая форма той же ошибки — сокращённое свойство
 *          `{ masterProviderId: null, providerId }` (так было в
 *          `schedule/usecases.ts`) → тоже 1 failed: шаблон ловит и `providerId }`,
 *          и `providerId,`, и `providerId: <идентификатор>`, но не форму набора
 *          `providerId: { in: … }`.
 */

type FakeRow = {
  type: "MASTER" | "STUDIO";
  owner: { providers: Array<{ id: string }> } | null;
} | null;

function fakeDb(row: FakeRow) {
  return {
    provider: {
      findUnique: (async () => row) as never,
    },
  };
}

describe("resolveOccupancyProviderIds", () => {
  it("профили мастера одного владельца — одна занятость", async () => {
    const ids = await resolveOccupancyProviderIds(
      fakeDb({ type: "MASTER", owner: { providers: [{ id: "personal" }, { id: "in-studio" }] } }),
      "in-studio",
    );
    expect(ids).toEqual(["in-studio", "personal"]);
  });

  it("профиль без владельца (заготовка студии) — только он сам", async () => {
    const ids = await resolveOccupancyProviderIds(fakeDb({ type: "MASTER", owner: null }), "staged");
    expect(ids).toEqual(["staged"]);
  });

  it("студия — только она сама, а не профили её владельца", async () => {
    const ids = await resolveOccupancyProviderIds(
      fakeDb({ type: "STUDIO", owner: { providers: [{ id: "owner-master" }] } }),
      "studio",
    );
    expect(ids).toEqual(["studio"]);
  });

  it("нет строки — сам id (вызывающий дальше получит свой 404)", async () => {
    expect(await resolveOccupancyProviderIds(fakeDb(null), "gone")).toEqual(["gone"]);
  });

  it("сам профиль входит в набор, даже если выборка владельца его не вернула", async () => {
    const ids = await resolveOccupancyProviderIds(
      fakeDb({ type: "MASTER", owner: { providers: [{ id: "personal" }] } }),
      "in-studio",
    );
    expect(ids).toContain("in-studio");
  });
});

describe("buildOccupancyBookingWhere", () => {
  it("исполнитель — любой профиль набора, плюс соло-форма на самих профилях", () => {
    expect(buildOccupancyBookingWhere(["b", "a", "b"])).toEqual({
      OR: [
        { masterProviderId: { in: ["a", "b"] } },
        { masterProviderId: null, providerId: { in: ["a", "b"] } },
      ],
    });
  });

  it("набор нормализуется: без пустых и повторов, в стабильном порядке", () => {
    expect(normalizeOccupancyIds(["z", "", "a", "z"])).toEqual(["a", "z"]);
  });
});

/**
 * Полнота: где осталась занятость «на один профиль».
 *
 * Шаблон — соло-клоз предиката с `providerId`, НЕ выраженным через набор
 * (`providerId: { in: … }`). Такой клоз ещё законен там, где речь не о
 * свободном времени, а о записях ЭТОГО профиля; каждое такое место названо
 * ниже с причиной, и число вхождений заморожено посайтово — новое вхождение в
 * том же файле тоже красит сторож.
 */
describe("STUDIO-MASTER-PROFILES · занятость не считается по одному профилю", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
  const SINGLE_PROFILE_CLAUSE =
    /masterProviderId:\s*null,\s*providerId(?:\s*[},]|:\s*(?!\{\s*in\b)[A-Za-z_$][\w$.]*)/g;

  /** Файл → [число вхождений, почему это не занятость]. */
  const PROFILE_SCOPED: Record<string, [number, string]> = {
    "src/lib/bookings/master-booking-scope.ts": [
      1,
      "что видит мастер в кабинете по профилю (отображение; объединение профилей — отдельный этап)",
    ],
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

  const found = new Map<string, number>();
  for (const rel of walk("src")) {
    const source = stripComments(readFileSync(resolve(PROJECT_ROOT, rel), "utf8"));
    const count = source.match(SINGLE_PROFILE_CLAUSE)?.length ?? 0;
    if (count > 0) found.set(rel, count);
  }

  it("обход что-то находит — иначе сторож вакуумный", () => {
    expect(found.size).toBeGreaterThan(0);
  });

  it("места с занятостью на один профиль — только названные, в названном числе", () => {
    const unexpected = [...found.entries()]
      .filter(([rel, count]) => PROFILE_SCOPED[rel]?.[0] !== count)
      .map(([rel, count]) => `${rel} (${count})`);
    expect(
      unexpected,
      "Здесь занятость считается по ОДНОМУ профилю. Если место решает «свободно ли время» — " +
        "берите набор профилей человека: resolveOccupancyProviderIds + buildOccupancyBookingWhere " +
        "(schedule/occupancy.ts). Если это записи именно этого профиля — впишите место и причину в PROFILE_SCOPED.",
    ).toEqual([]);
  });

  it("в списке нет протухших мест", () => {
    const stale = Object.keys(PROFILE_SCOPED).filter((rel) => !found.has(rel));
    expect(stale).toEqual([]);
  });

  it("форма набора шаблоном не ловится (иначе сторож красит сам модуль)", () => {
    expect("{ masterProviderId: null, providerId: { in: ids } }".match(SINGLE_PROFILE_CLAUSE)).toBeNull();
    expect("{ masterProviderId: null, providerId }".match(SINGLE_PROFILE_CLAUSE)).not.toBeNull();
    expect("{ masterProviderId: null, providerId: provider.id }".match(SINGLE_PROFILE_CLAUSE)).not.toBeNull();
  });
});

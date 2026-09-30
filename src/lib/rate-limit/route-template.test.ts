import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  API_STATIC_SEGMENTS_FOR_TESTS,
  DYNAMIC_SEGMENT_PLACEHOLDER,
  toApiRouteTemplate,
} from "@/lib/rate-limit/route-template";

/**
 * SEC-03 — guard шаблонизатора пути для ключа рейт-лимита.
 *
 * Нормализация верна ровно настолько, насколько список литеральных сегментов
 * совпадает с деревом `src/app/api/**`. Список — данные, а данные протухают
 * молча, поэтому тест обходит РЕАЛЬНОЕ дерево (та же форма, что у DMMF-гвардов
 * инв. #35/#38: сверяем с источником, а не перечисляем руками).
 *
 * Асимметрия последствий, из-за которой guard устроен именно так:
 *   - лишняя запись в списке → значение динамического сегмента может совпасть
 *     с ней и не схлопнуться → дыра. Ловим сверкой «нет записей вне дерева».
 *   - недостающая запись → литеральный сегмент схлопнется в `:id` и роут
 *     разделит ведро с соседями. Лимит становится строже, не мягче — но это
 *     всё равно неожиданный 429, поэтому ловим и это.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const API_ROOT = resolve(PROJECT_ROOT, "src", "app", "api");

/** Литеральные сегменты всех роутов `src/app/api/**` — из файловой системы. */
function collectStaticSegmentsFromTree(): Set<string> {
  const found = new Set<string>(["api"]);

  const walk = (dir: string, ownSegment: string | null): boolean => {
    const entries = readdirSync(dir, { withFileTypes: true });
    const hasRoute = entries.some(
      (entry) => entry.isFile() && (entry.name === "route.ts" || entry.name === "route.tsx"),
    );

    let routeBelow = false;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      routeBelow = walk(resolve(dir, entry.name), entry.name) || routeBelow;
    }

    const reachable = hasRoute || routeBelow;
    if (reachable && ownSegment !== null) {
      const isDynamic = ownSegment.startsWith("[");
      const isRouteGroup = ownSegment.startsWith("(") && ownSegment.endsWith(")");
      if (!isDynamic && !isRouteGroup) found.add(ownSegment);
    }
    return reachable;
  };

  walk(API_ROOT, null);
  return found;
}

describe("SEC-03 · API_STATIC_SEGMENTS приколочен к дереву роутов", () => {
  const fromTree = collectStaticSegmentsFromTree();

  it("дерево вообще прочиталось (защита от вакуумного прогона)", () => {
    expect(fromTree.size).toBeGreaterThan(100);
    expect(fromTree.has("bookings")).toBe(true);
  });

  it("каждый литеральный сегмент дерева есть в списке", () => {
    const missing = [...fromTree]
      .filter((segment) => !API_STATIC_SEGMENTS_FOR_TESTS.has(segment))
      .sort();
    expect(
      missing,
      `Добавьте эти сегменты в API_STATIC_SEGMENTS (src/lib/rate-limit/route-template.ts): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("в списке нет записей, которых нет в дереве", () => {
    const stale = [...API_STATIC_SEGMENTS_FOR_TESTS]
      .filter((segment) => !fromTree.has(segment))
      .sort();
    expect(
      stale,
      `Эти сегменты удалены из дерева — уберите их из API_STATIC_SEGMENTS: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});

describe("SEC-03 · toApiRouteTemplate", () => {
  it("схлопывает cuid в id-сегменте — разные id дают ОДИН ключ", () => {
    const a = toApiRouteTemplate("/api/public/bookings/cm5qz1a0b0000v3l8h2k9d1x7");
    const b = toApiRouteTemplate("/api/public/bookings/cm5qz1a0b0000v3l8h2k9d1x8");
    expect(a).toBe("/api/public/bookings/:id");
    expect(a).toBe(b);
  });

  it("схлопывает непрозрачные публичные id (`e_`-префикс, rule 12)", () => {
    expect(toApiRouteTemplate("/api/providers/e_Y21xeno")).toBe("/api/providers/:id");
  });

  it("схлопывает словоподобные значения — slug, code, clientKey, дату", () => {
    // Именно эти формы не отличит эвристика «похоже на id»: они выглядят как
    // обычный статический сегмент. Схлопывание по дереву их ловит.
    expect(toApiRouteTemplate("/api/chat/threads/anna-i-elena-2026")).toBe(
      "/api/chat/threads/:id",
    );
    expect(toApiRouteTemplate("/api/model-offers/summer/apply")).toBe(
      "/api/model-offers/:id/apply",
    );
    expect(toApiRouteTemplate("/api/master/clients/plus79991000000/detail")).toBe(
      "/api/master/clients/:id/detail",
    );
    // Дата в роли значения: сегмента «2026-08-05» в дереве нет.
    expect(toApiRouteTemplate("/api/studio/schedule/requests/2026-08-05/approve")).toBe(
      "/api/studio/schedule/requests/:id/approve",
    );
  });

  it("не трогает полностью статический путь", () => {
    expect(toApiRouteTemplate("/api/bookings")).toBe("/api/bookings");
    expect(toApiRouteTemplate("/api/public/providers")).toBe("/api/public/providers");
  });

  it("не трогает не-API пути (тир для них не резолвится)", () => {
    expect(toApiRouteTemplate("/catalog/moskva")).toBe("/catalog/moskva");
    expect(toApiRouteTemplate("/u/anna-sokolova")).toBe("/u/anna-sokolova");
  });

  it("лишние слэши не создают новых вёдер", () => {
    expect(toApiRouteTemplate("/api//bookings")).toBe("/api/bookings");
    expect(toApiRouteTemplate("/api///public//bookings//cm5qz1a0b0000v3l8h2k9d1x7")).toBe(
      "/api/public/bookings/:id",
    );
  });

  it("плейсхолдер сам не может быть литеральным сегментом", () => {
    expect(API_STATIC_SEGMENTS_FOR_TESTS.has(DYNAMIC_SEGMENT_PLACEHOLDER)).toBe(false);
  });
});

/**
 * Взаимодействие с инв. #6: `isSensitiveRouteKey` (`rate-limit/index.ts`)
 * вытаскивает `/api/...` обратно из ключа и сверяет с `SENSITIVE_ROUTE_PREFIXES`.
 * Если бы нормализация съедала литеральный префикс, чувствительные роуты
 * молча перестали бы быть fail-closed при недоступности Redis.
 */
describe("SEC-03 · шаблон сохраняет sensitive-префиксы (инв. #6)", () => {
  const SENSITIVE_PREFIXES = [
    "/api/auth",
    "/api/bookings",
    "/api/payments",
    "/api/me/delete",
    "/api/cabinet/master/delete",
    "/api/cabinet/studio/delete",
    "/api/categories/propose",
    "/api/master/portfolio",
    "/api/studio",
    "/api/studios",
    "/api/reviews",
  ];

  const CASES = [
    "/api/bookings/cm5qz1a0b0000v3l8h2k9d1x7/cancel",
    "/api/studios/cm5qz1a0b0000v3l8h2k9d1x7/masters/cm5qz1a0b0000v3l8h2k9d1y2/schedule",
    "/api/reviews/cm5qz1a0b0000v3l8h2k9d1x7",
    "/api/master/portfolio/media/cm5qz1a0b0000v3l8h2k9d1x7/classification",
  ];

  for (const path of CASES) {
    it(`${path} остаётся под sensitive-префиксом`, () => {
      const template = toApiRouteTemplate(path);
      const matches = SENSITIVE_PREFIXES.some(
        (prefix) => template === prefix || template.startsWith(`${prefix}/`),
      );
      expect(matches).toBe(true);
    });
  }
});

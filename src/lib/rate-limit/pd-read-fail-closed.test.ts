import { describe, expect, it } from "vitest";

import { isSensitiveRouteKey } from "@/lib/rate-limit";
import { proxyRateLimitKey } from "@/lib/rate-limit/keys";
import { resolveExport, routeFiles, symbolReaches } from "@/lib/testing/module-reach";

/**
 * CRM-MOBILE-FAIL-CLOSED (C-04) — роут, из обработчика которого достижим след
 * массового чтения ПДн (`recordPdAccess`), fail-closed при обрыве Redis.
 *
 * Решение FIX-B12: массовые ЧТЕНИЯ ПДн — fail-closed, потому что именно они
 * вектор перечисления, ради которого заведён `PdAccessLog`. Но держалось оно
 * СПИСКОМ префиксов, и список протух дважды: мобильные чтения CRM
 * (`/api/cabinet/{master,studio}/clients`, MOBILE-MASTER-C / MOBILE-STUDIO-C) и
 * «История событий» админки с выгрузкой (`/api/admin/dashboard/events{,/export}`,
 * ADMIN-EVENTS-02) завели след, но не префикс. Соседний сторож полноты
 * (`sensitive-routes-completeness.test.ts`) смотрит только мутирующие роуты,
 * поэтому пропуск GET-чтения не краснил ничего.
 *
 * Здесь членство выводится по СВОЙСТВУ: проект сам объявил поверхность ПДн,
 * поставив на её пути `recordPdAccess`. Каждый экспортированный метод каждого
 * `route.ts`, из которого след достижим через импорты (`lib/testing/
 * module-reach.ts`: переименованный импорт, пространство имён, переэкспорт,
 * функция, переданная значением), обязан давать чувствительный ключ прокси.
 * Решение — по месту (роут#метод), исключения — посайтовые, с причиной.
 *
 * Слепые формы — названы в `module-reach.ts` (метод объекта, `import()`).
 *
 * @probe 2026-10-30 — по одному, с откатом:
 *   1. правдоподобный новый роут: `src/app/api/cabinet/studio/clients-export/
 *      route.ts` (сосед ВНЕ префикса `/api/cabinet/studio/clients`, как
 *      выгрузка «Истории событий» рядом со списком), сервис импортирован под
 *      другим именем (`import { loadStudioClientsPage as loadPage }`), обработчик —
 *      `export const GET = async (req: Request) => …` → 1 failed: «каждый
 *      роут, из которого достижим recordPdAccess, — fail-closed» — «чтение ПДн
 *      без fail-closed: GET /api/cabinet/studio/clients-export»;
 *   2. снять из `SENSITIVE_ROUTE_PREFIXES` `/api/admin/dashboard/events` → 1
 *      failed здесь: «чтение ПДн без fail-closed: GET /api/admin/dashboard/
 *      events, GET /api/admin/dashboard/events/export» (выгрузка пишет след
 *      сама, список — через сервис в `features/`) и 1 в
 *      `fail-closed-classes.test.ts` — пин класса (в);
 *   3. обход только по ВЫЗОВАМ, без ссылок (в `edgesOf` идентификатор вне
 *      позиции вызова пропускается) при обёрнутом обработчике
 *      `export const GET = withPd(handler)` в роуте списка клиентов студии →
 *      1 failed: «семья найдена через границы модулей…» — «семья найдена:
 *      GET /api/cabinet/studio/clients: expected [ …(4) ] to include
 *      'GET /api/cabinet/studio/clients'»: роут выпал из семьи молча. A/B —
 *      тот же обёрнутый роут с рёбрами по ссылкам: 4 passed.
 */

const ROUTE_ROOT = "src/app/api";
const TARGET = resolveExport("src/lib/audit/pd-access.ts", "recordPdAccess");

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/** Исключения: роут#метод → почему чтение ПДн не fail-closed. Пусто намеренно. */
const NOT_FAIL_CLOSED: Record<string, string> = {};

function routePath(file: string): string {
  const dir = file.slice("src/app".length).replace(/\/route\.tsx?$/, "");
  return dir.replace(/\/\([^)]*\)/g, "");
}

type Site = { site: string; method: string; route: string };

function pdReadSites(): Site[] {
  if (!TARGET) throw new Error("recordPdAccess не найден в src/lib/audit/pd-access.ts");
  const out: Site[] = [];
  for (const file of routeFiles(ROUTE_ROOT)) {
    const route = routePath(file);
    for (const method of METHODS) {
      const handler = resolveExport(file, method);
      if (!handler || !symbolReaches(handler, TARGET)) continue;
      out.push({ site: `${method} ${route}`, method, route });
    }
  }
  return out;
}

const family = pdReadSites();

const isFailClosed = ({ method, route }: Site) =>
  isSensitiveRouteKey(proxyRateLimitKey("publicApi", "198.51.100.9", method, route));

describe("CRM-MOBILE-FAIL-CLOSED · чтение ПДн со следом — fail-closed", () => {
  it("семья найдена через границы модулей (иначе сторож вакуумен)", () => {
    const sites = family.map((f) => f.site);
    for (const expected of [
      // Роут → сервис в `lib/master` → след.
      "GET /api/cabinet/master/clients",
      // Роут → сервис в `features/` → помощник того же файла → след.
      "GET /api/cabinet/studio/clients",
      "GET /api/cabinet/studio/clients/[clientKey]",
      "GET /api/admin/dashboard/events",
      // След прямо в роуте.
      "GET /api/admin/dashboard/events/export",
    ]) {
      expect(sites, `семья найдена: ${expected}`).toContain(expected);
    }
  });

  it("каждый роут, из которого достижим recordPdAccess, — fail-closed", () => {
    const failOpen = family
      .filter((f) => !(f.site in NOT_FAIL_CLOSED) && !isFailClosed(f))
      .map((f) => f.site)
      .sort();
    expect(
      failOpen,
      "чтение ПДн без fail-closed: " +
        failOpen.join(", ") +
        ". Решение FIX-B12 — массовые чтения ПДн fail-closed: добавьте префикс в " +
        "`SENSITIVE_ROUTE_PREFIXES` (`src/lib/rate-limit/index.ts`) либо исключение " +
        "с причиной в `NOT_FAIL_CLOSED`.",
    ).toEqual([]);
  });

  it("исключения не протухли", () => {
    const sites = new Set(family.map((f) => f.site));
    for (const site of Object.keys(NOT_FAIL_CLOSED)) expect(sites.has(site), site).toBe(true);
  });

  it("контроль: роут без следа ПДн в семью не попадает", () => {
    // Иначе первый тест зеленел бы и на «достижимо всё» — обход по ссылкам
    // шире вызова, и это его возможная поломка.
    const sites = new Set(family.map((f) => f.site));
    for (const control of ["POST /api/favorites/toggle", "GET /api/cities", "GET /api/cabinet/master/bookings"]) {
      expect(sites.has(control), control).toBe(false);
    }
  });
});

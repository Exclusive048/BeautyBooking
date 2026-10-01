import { describe, expect, it } from "vitest";
import { exportedReachers } from "@/lib/testing/function-reach";

/**
 * 29.09 доработки · 31 (PERF-06; решение владельца 31.1 — окно 24 месяца —
 * постоянное правило): каждый вход группировки клиентов идёт с окном.
 *
 * Окно (`crmClientsWindowStart`, `crm/clients-window.ts`) появилось в
 * AUDIT-CAMPAIGN-02 п.3 на трёх поверхностях — а четвёртая (`getMasterClients`,
 * `GET /api/master/clients`) читала ВСЮ историю броней мастера без окна и без
 * `take`, и ни один сторож этого не видел. Здесь семья выводится по СВОЙСТВУ:
 * экспортируемая функция, которая сама или через функции того же файла зовёт
 * `groupBookings(` (`lib/crm/clients.ts`), обязана так же дойти до
 * `crmClientsWindowStart(`. Исключения — посайтовые (файл#функция).
 *
 * Слепые формы (названы): окно, посчитанное в функции ДРУГОГО модуля и
 * переданное параметром; группировка не через `groupBookings`; дата окна,
 * вычисленная своим `setUTCMonth` без `crmClientsWindowStart`.
 *
 * @probe 2026-10-01 (по одной оси):
 *   1. В `loadStudioClientsData` (`studio-cabinet/clients/server/clients-data.service.ts`)
 *      условие окна убрано из `where` → красный «вход группировки клиентов без
 *      окна: …clients-data.service.ts#loadStudioClientsData».
 *   2. Правдоподобная форма: окно вынесено в функцию того же файла
 *      (`const since = () => crmClientsWindowStart()`, в `where` — `since()`) →
 *      ЗЕЛЁНЫЙ, и это верно: функция того же файла входит в граф достижимости.
 *      Окно в функции ДРУГОГО модуля — слепая форма выше.
 */

/** Не список: карточка ОДНОГО клиента — запрос сужен его ключом, окна не нужно. */
const NOT_A_LIST: Record<string, string> = {
  "src/lib/master/clients-view.service.ts#getMasterClientDetail":
    "детальная панель одного клиента — запрос сужен `clientFilter`, история клиента видна целиком",
};

const family = exportedReachers("groupBookings", "src/lib/crm/clients.ts", ["crmClientsWindowStart"]).map((f) => ({
  site: f.site,
  windowed: f.reached.crmClientsWindowStart,
}));

describe("окно CRM на входе группировки клиентов", () => {
  it("семья найдена: страницы «Клиенты» мастера и студии", () => {
    const sites = family.map((f) => f.site);
    for (const expected of [
      "src/lib/master/clients-view.service.ts#getMasterClientsView",
      "src/features/studio-cabinet/clients/server/clients-data.service.ts#loadStudioClientsData",
    ]) {
      expect(sites, expected).toContain(expected);
    }
  });

  it("каждый вход группировки, кроме карточки одного клиента, — с окном", () => {
    const missing = family.filter((f) => !f.windowed && !(f.site in NOT_A_LIST)).map((f) => f.site);
    expect(missing, `вход группировки клиентов без окна: ${missing.join(", ")}`).toEqual([]);
  });

  it("исключения не протухли", () => {
    const sites = new Set(family.map((f) => f.site));
    for (const site of Object.keys(NOT_A_LIST)) expect(sites.has(site), site).toBe(true);
  });
});

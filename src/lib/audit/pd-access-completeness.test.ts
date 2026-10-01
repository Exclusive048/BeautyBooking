import { describe, expect, it } from "vitest";
import { exportedReachers } from "@/lib/testing/function-reach";

/**
 * 29.09 доработки · 16 (PD-ACCESS-ANOMALY-DETECTION, шаг В0) — каждая функция,
 * которая отдаёт список клиентов, пишет след `recordPdAccess`.
 *
 * Пробел был реальным: `master.clients.list` и `studio.clients.list` писали
 * только API-роуты списков, которые интерфейс не зовёт, а настоящие страницы
 * читали базу через SSR (`getMasterClientsView`, `loadStudioClientsData`) — и
 * след молчал. RKN-FIX-10 проверялся запросом прямо в API, поэтому пробел не
 * заметили; детектор аномалий на такой таблице ничего бы не увидел.
 *
 * Семья выводится по СВОЙСТВУ, а не списком: экспортируемая функция, которая
 * сама или через функции того же файла зовёт `groupBookings(` (сборка списка
 * клиентов из броней, `lib/crm/clients.ts`). Каждая такая функция обязана так
 * же дойти до `recordPdAccess(`. Исключения — посайтовые (файл#функция).
 *
 * Слепая форма: список собран не через `groupBookings` (своя группировка) или
 * помощник из другого модуля — такая функция в семью не попадёт.
 *
 * @probe 2026-09-29 — в `getMasterClientsView` (`lib/master/clients-view.service.ts`)
 *        вызов `recordPdAccess` заменён пустой функцией: красный «список клиентов без
 *        следа» с `clients-view.service.ts#getMasterClientsView`. Возвращено — зелёный.
 */

/** Не перечисление: карточка ОДНОГО клиента за его ключом (RKN-FIX-10 — детальные чтения вне следа). */
const NOT_A_LIST: Record<string, string> = {
  "src/lib/master/clients-view.service.ts#getMasterClientDetail": "карточка одного клиента по ключу — не перечисление базы",
};

const family = exportedReachers("groupBookings", "src/lib/crm/clients.ts", ["recordPdAccess"]).map((f) => ({
  site: f.site,
  traced: f.reached.recordPdAccess,
}));

describe("след массовых чтений ПДн — полнота", () => {
  it("семья найдена: SSR-страницы «Клиенты» мастера и студии", () => {
    const sites = family.map((f) => f.site);
    for (const expected of [
      "src/lib/master/clients-view.service.ts#getMasterClientsView",
      "src/features/studio-cabinet/clients/server/clients-data.service.ts#loadStudioClientsData",
    ]) {
      expect(sites, expected).toContain(expected);
    }
  });

  it("каждая функция, отдающая список клиентов, пишет след", () => {
    const missing = family.filter((f) => !f.traced && !(f.site in NOT_A_LIST)).map((f) => f.site);
    expect(missing, `список клиентов без следа recordPdAccess: ${missing.join(", ")}`).toEqual([]);
  });

  it("исключения не протухли", () => {
    const sites = new Set(family.map((f) => f.site));
    for (const site of Object.keys(NOT_A_LIST)) expect(sites.has(site), site).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { ADMIN_EVENTS_POLL_WINDOW_MS } from "./event-categories";
import {
  ADMIN_EVENTS_POLL_OVERLAP_MS,
  ADMIN_EVENTS_POLL_STALE_MS,
  planAdminEventsPoll,
} from "./events-poll-plan";

/**
 * ADMIN-EVENTS-SINCE-TRAIL — опрос новых не должен получить 400 от роута,
 * сколько бы лента ни была открыта, и не должен терять события.
 *
 * Роут отказывает, когда `since < serverNow - ADMIN_EVENTS_POLL_WINDOW_MS`.
 * Здесь та же проверка выписана как `routeAccepts` и прогоняется по всему
 * диапазону «сколько прошло с синхронизации» — при любом сдвиге часов браузера.
 *
 * @probe 2026-10-30 — по одному, с откатом:
 *   1. вернуть прежнее правило «since = время самого свежего события» (у
 *      тихого раздела оно старше окна): в `planAdminEventsPoll` вместо
 *      `sync.asOfMs - OVERLAP` подставить `sync.asOfMs - 2 * WINDOW` → 2 failed,
 *      среди них «опрос до порога устаревания роут принимает» — «после 0 мин:
 *      expected false to be true»;
 *   2. снять ветку устаревания (`return { kind: "reset" }`) → 2 failed:
 *      «после порога — перезагрузка…» и «обрезанный опрос…» — «expected 'poll'
 *      to be 'reset'»: без неё скрытая больше часа вкладка слала бы since
 *      старше окна и получала 400 на каждом тике.
 */

const MINUTE = 60_000;
const SERVER_T0 = new Date("2026-10-30T12:00:00.000Z").getTime();

function routeAccepts(since: number, serverNow: number): boolean {
  return since >= serverNow - ADMIN_EVENTS_POLL_WINDOW_MS;
}

describe("planAdminEventsPoll", () => {
  it("свежая синхронизация — since с запасом назад от момента сервера", () => {
    const plan = planAdminEventsPoll({ asOfMs: SERVER_T0, atClientMs: 5_000 }, 5_000 + 30_000);
    expect(plan).toEqual({ kind: "poll", since: SERVER_T0 - ADMIN_EVENTS_POLL_OVERLAP_MS });
  });

  it("опрос до порога устаревания роут принимает — при любом сдвиге часов браузера", () => {
    // Часы браузера: отстают на сутки, верные, спешат на 3 часа.
    for (const skew of [-24 * 60 * MINUTE, 0, 3 * 60 * MINUTE]) {
      const atClientMs = SERVER_T0 + skew;
      for (let elapsed = 0; elapsed <= ADMIN_EVENTS_POLL_STALE_MS; elapsed += 5 * MINUTE) {
        const plan = planAdminEventsPoll({ asOfMs: SERVER_T0, atClientMs }, atClientMs + elapsed);
        expect(plan.kind, `после ${elapsed / MINUTE} мин`).toBe("poll");
        if (plan.kind !== "poll") continue;
        // Сервер получает запрос ещё через минуту — запас на сеть.
        expect(routeAccepts(plan.since, SERVER_T0 + elapsed + MINUTE), `после ${elapsed / MINUTE} мин`).toBe(true);
        // И since не новее уже отданного: событие, пришедшее после
        // синхронизации, в выдачу попадёт.
        expect(plan.since).toBeLessThanOrEqual(SERVER_T0);
      }
    }
  });

  it("после порога — перезагрузка первой страницы, а не опрос со старым since", () => {
    const plan = planAdminEventsPoll(
      { asOfMs: SERVER_T0, atClientMs: 0 },
      ADMIN_EVENTS_POLL_STALE_MS + 1,
    );
    expect(plan.kind).toBe("reset");
  });

  it("обрезанный опрос (atClientMs = −∞) — перезагрузка на следующем тике", () => {
    const plan = planAdminEventsPoll({ asOfMs: SERVER_T0, atClientMs: Number.NEGATIVE_INFINITY }, 1);
    expect(plan.kind).toBe("reset");
  });

  it("порог устаревания оставляет запас до окна роута", () => {
    expect(ADMIN_EVENTS_POLL_STALE_MS + ADMIN_EVENTS_POLL_OVERLAP_MS).toBeLessThan(ADMIN_EVENTS_POLL_WINDOW_MS);
  });
});

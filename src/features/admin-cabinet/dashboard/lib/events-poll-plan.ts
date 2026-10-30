import { ADMIN_EVENTS_POLL_WINDOW_MS } from "@/features/admin-cabinet/dashboard/lib/event-categories";

/**
 * ADMIN-EVENTS-SINCE-TRAIL — откуда опрос новых «Истории событий» берёт свой
 * `since`. Client-safe, без React: правило проверяется тестом отдельно от хука.
 *
 * Роут принимает `since` не старше `ADMIN_EVENTS_POLL_WINDOW_MS` (час). Прежний
 * опрос слал `since` = время самого свежего показанного события, и у тихого
 * раздела («Действия админов», ночью — любой) оно уходит за час за считаные
 * минуты: такой опрос получал бы 400 каждые 30 с. Поэтому отсчёт — от момента
 * последней полной синхронизации (`asOfMs` ответа), а не от событий.
 *
 * Часы — СЕРВЕРА: `asOfMs` пришёл из ответа, а часы браузера участвуют только
 * разностью «сколько прошло с синхронизации». Сдвиг часов у админа поэтому не
 * даёт ни 400 (since старше окна на сервере), ни пропуска событий (since
 * новее того, что сервер уже отдал).
 */

/**
 * Запас назад от момента прошлой синхронизации. Событие, чья строка записана
 * со временем чуть раньше `asOfMs`, но закоммичена после чтения (транзакция
 * живёт до `statement_timeout` = 30 с, RES-24), иначе выпало бы. Дубликаты
 * отсеивает вызывающий по `id`.
 */
export const ADMIN_EVENTS_POLL_OVERLAP_MS = 60_000;

/**
 * Сколько можно не синхронизироваться, прежде чем список считать устаревшим.
 * Дольше (скрытая вкладка, нет сети) — промежуток уже не покрыть опросом в
 * окне, и список перезагружается первой страницей. Это обычное чтение истории
 * со следом — то же, что перезагрузить страницу. Запас до окна (10 мин) — на
 * задержку запроса и `ADMIN_EVENTS_POLL_OVERLAP_MS`.
 */
export const ADMIN_EVENTS_POLL_STALE_MS = ADMIN_EVENTS_POLL_WINDOW_MS - 10 * 60_000;

/** Последняя полная синхронизация списка с сервером. */
export type AdminEventsPollSync = {
  /** Момент сервера из ответа (`AdminEventsResponse.asOfMs`). */
  asOfMs: number;
  /** Часы браузера в момент запроса — только для разности с «сейчас». */
  atClientMs: number;
};

export type AdminEventsPollPlan = { kind: "poll"; since: number } | { kind: "reset" };

export function planAdminEventsPoll(sync: AdminEventsPollSync, nowClientMs: number): AdminEventsPollPlan {
  if (nowClientMs - sync.atClientMs > ADMIN_EVENTS_POLL_STALE_MS) return { kind: "reset" };
  return { kind: "poll", since: Math.max(1, sync.asOfMs - ADMIN_EVENTS_POLL_OVERLAP_MS) };
}

"use client";

import { useEffect, useRef } from "react";
import {
  planAdminEventsPoll,
  type AdminEventsPollSync,
} from "@/features/admin-cabinet/dashboard/lib/events-poll-plan";
import type {
  AdminEventCategory,
  AdminEventItem,
  AdminEventsResponse,
} from "@/features/admin-cabinet/dashboard/types";

// PERF-27 (AUDIT-CAMPAIGN-02 п.4, ратифицировано владельцем): 5с → 30с — как у
// соседнего system-health.tsx. 720 запросов/час на вкладку → 120; SSE-канал ради
// одной админской ленты не строится (ратифицировано там же). Подпись бейджа
// берёт интервал ОТСЮДА (POLL_MS/1000) — цифра в UI не может разойтись с кодом.
export const ADMIN_EVENTS_POLL_MS = 30_000;

/** Сколько событий забирает один опрос (потолок роута). Больше — список
 *  перезагружается первой страницей: промежуток опросом уже не покрыть. */
const POLL_LIMIT = 100;

type Options = {
  category: AdminEventCategory;
  /** `asOfMs` ответа, которым список заполнен (серверный рендер). */
  initialAsOfMs: number;
  /** Сколько событий в первой странице списка — для перезагрузки. */
  pageSize: number;
  /** Пришедшие события — отсеивать уже показанные по `id` обязан вызывающий:
   *  `since` берётся с запасом назад. */
  onEvents: (items: AdminEventItem[]) => void;
  /** Список устарел — пришла первая страница заново: заменить список целиком. */
  onReset: (page: AdminEventsResponse) => void;
};

/**
 * Опрос новых событий «Истории событий» (виджет дашборда и страница
 * `/admin/events`). Опрос — только свежее, последний час: такой запрос следа
 * чтения ПДн не пишет (`admin.events.list`), и роут держит его узким
 * (ADMIN-EVENTS-SINCE-TRAIL — `since` не старше часа и без курсора). Откуда
 * брать `since` и когда список устарел — `planAdminEventsPoll`. На скрытой
 * вкладке молчит; вернувшись после долгого перерыва, перезагружает первую
 * страницу обычным чтением (со следом — как перезагрузка страницы).
 */
export function useAdminEventsPoll({ category, initialAsOfMs, pageSize, onEvents, onReset }: Options): void {
  const isVisible = useRef(true);
  const onEventsRef = useRef(onEvents);
  const onResetRef = useRef(onReset);
  // PERF-27: тик, пришедший поверх незавершённого запроса, ПРОПУСКАЕТСЯ.
  // Раньше `setInterval` стрелял безусловно, и медленный ответ складывал
  // запросы стопкой: чем тяжелее серверу, тем больше их в полёте. `useSerialTask`
  // здесь не подходит намеренно — он ОТКЛАДЫВАЕТ вытесненный вход и выполняет
  // его следом, а у опроса значение — «сейчас».
  const inFlight = useRef(false);
  // Момент браузера ставится при монтировании: серверный рендер был только что.
  const sync = useRef<AdminEventsPollSync>({ asOfMs: initialAsOfMs, atClientMs: 0 });

  useEffect(() => {
    sync.current = { asOfMs: initialAsOfMs, atClientMs: Date.now() };
  }, [initialAsOfMs]);

  useEffect(() => {
    onEventsRef.current = onEvents;
    onResetRef.current = onReset;
  }, [onEvents, onReset]);

  useEffect(() => {
    const onVisibility = () => {
      isVisible.current = document.visibilityState === "visible";
    };
    // PERF-27: вкладка, открытая в фоне, не опрашивает API как активная.
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const tick = async () => {
      if (!isVisible.current || inFlight.current) return;
      inFlight.current = true;
      const startedAt = Date.now();
      const plan = planAdminEventsPoll(sync.current, startedAt);
      try {
        const params = new URLSearchParams(
          plan.kind === "poll"
            ? { since: String(plan.since), limit: String(POLL_LIMIT) }
            : { limit: String(pageSize) },
        );
        if (category !== "all") params.set("category", category);
        const res = await fetch(`/api/admin/dashboard/events?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; data?: AdminEventsResponse };
        if (!json.ok || !json.data) return;
        const data = json.data;
        if (plan.kind === "reset") {
          onResetRef.current(data);
          sync.current = { asOfMs: data.asOfMs, atClientMs: startedAt };
          return;
        }
        if (data.items.length > 0) onEventsRef.current(data.items);
        // Опрос обрезан по `limit` — между показанным и пришедшим есть
        // промежуток: следующий тик перезагрузит первую страницу.
        sync.current =
          data.nextCursor === null
            ? { asOfMs: data.asOfMs, atClientMs: startedAt }
            : { asOfMs: sync.current.asOfMs, atClientMs: Number.NEGATIVE_INFINITY };
      } catch {
        // Тихо — следующий опрос повторит; на живой панели сообщение каждые
        // 30 с было бы шумом, а показанные события остаются на экране.
      } finally {
        inFlight.current = false;
      }
    };
    const interval = setInterval(() => void tick(), ADMIN_EVENTS_POLL_MS);
    return () => clearInterval(interval);
  }, [category, pageSize]);
}

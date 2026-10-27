"use client";

import { useEffect, useRef } from "react";
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

type Options = {
  category: AdminEventCategory;
  /** Самый свежий показанный момент (unix ms); 0 — ничего не показано. */
  latestMs: number;
  /** Пришедшие события — отсеивать уже показанные по `id` обязан вызывающий:
   *  граница `since` включительная. */
  onEvents: (items: AdminEventItem[]) => void;
};

/**
 * Опрос новых событий «Истории событий» (виджет дашборда и страница
 * `/admin/events`). Опрос — только свежее после `latestMs`, поэтому след
 * чтения ПДн он не пишет (`admin.events.list`). На скрытой вкладке молчит.
 */
export function useAdminEventsPoll({ category, latestMs, onEvents }: Options): void {
  const isVisible = useRef(true);
  const onEventsRef = useRef(onEvents);
  // PERF-27: тик, пришедший поверх незавершённого запроса, ПРОПУСКАЕТСЯ.
  // Раньше `setInterval` стрелял безусловно, и медленный ответ складывал
  // запросы стопкой: чем тяжелее серверу, тем больше их в полёте. `useSerialTask`
  // здесь не подходит намеренно — он ОТКЛАДЫВАЕТ вытесненный вход и выполняет
  // его следом, а у опроса значение — «сейчас».
  const inFlight = useRef(false);
  // Пустой список тоже опрашивается через `since`: запрос без него — это уже
  // чтение истории (и след в журнале ПДн), а не опрос. Запас в один интервал
  // покрывает события между серверным рендером и монтированием.
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now() - ADMIN_EVENTS_POLL_MS;
  }, []);

  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

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
      try {
        const params = new URLSearchParams({ since: String(latestMs > 0 ? latestMs : startedAt.current) });
        if (category !== "all") params.set("category", category);
        const res = await fetch(`/api/admin/dashboard/events?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; data?: AdminEventsResponse };
        if (json.ok && json.data && json.data.items.length > 0) onEventsRef.current(json.data.items);
      } catch {
        // Тихо — следующий опрос повторит; на живой панели сообщение каждые
        // 30 с было бы шумом, а показанные события остаются на экране.
      } finally {
        inFlight.current = false;
      }
    };
    const interval = setInterval(() => void tick(), ADMIN_EVENTS_POLL_MS);
    return () => clearInterval(interval);
  }, [category, latestMs]);
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { EventsFeedItem } from "@/features/admin-cabinet/dashboard/components/events-feed-item";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { fetchJson } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminEventItem,
  AdminEventsResponse,
} from "@/features/admin-cabinet/dashboard/types";

// PERF-27 (AUDIT-CAMPAIGN-02 п.4, ратифицировано владельцем): 5с → 30с — как у
// соседнего system-health.tsx. 720 запросов/час на вкладку → 120; SSE-канал ради
// одной админской ленты не строится (ратифицировано там же). Подпись бейджа
// берёт интервал ОТСЮДА (POLL_MS/1000) — цифра в UI не может разойтись с кодом.
const POLL_MS = 30_000;
/** ADMIN-EVENTS-TABLE: сколько строк догружает «Показать ещё». */
const PAGE_SIZE = 30;
const EXPORT_DAYS = [7, 30, 90] as const;

type Props = {
  initial: AdminEventItem[];
  initialNextBefore: number | null;
};

const T = UI_TEXT.adminPanel.dashboard.feed;

/** Event history. Initial set comes from the server (SSR), then a polling
 * loop (POLL_MS) pulls anything newer than the latest `timeMs` we've
 * already shown. ADMIN-EVENTS-TABLE (2026-10-01): компактная таблица вместо
 * ленты карточек, «Показать ещё» догружает старые события по курсору
 * `before`, кнопка «Скачать в Excel» выгружает период в .xlsx.
 * Polling pauses when the tab is hidden — there's no point burning
 * rate-limit budget for a tab no admin is looking at. */
export function EventsFeed({ initial, initialNextBefore }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<AdminEventItem[]>(initial);
  const [nextBefore, setNextBefore] = useState<number | null>(initialNextBefore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportDays, setExportDays] = useState<(typeof EXPORT_DAYS)[number]>(30);
  const seenIds = useRef<Set<string>>(new Set(initial.map((e) => e.id)));
  const isVisible = useRef(true);
  // PERF-27: тик, пришедший поверх незавершённого запроса, ПРОПУСКАЕТСЯ.
  // Раньше `setInterval` стрелял безусловно, и медленный ответ (админский
  // запрос по событиям — не самый дешёвый) складывал запросы стопкой: чем
  // тяжелее серверу, тем больше их в полёте одновременно. `useSerialTask`
  // здесь не подходит намеренно — он ОТКЛАДЫВАЕТ вытесненный вход и
  // выполняет его следом, а у опроса значение — «сейчас», и отложенный тик
  // сразу после предыдущего это тот же лишний запрос.
  const inFlight = useRef(false);

  const latestMs = items.length > 0 ? items[0]!.timeMs : 0;

  const poll = useCallback(async (since: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const url = since
        ? `/api/admin/dashboard/events?since=${since}`
        : "/api/admin/dashboard/events";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok: boolean;
        data?: AdminEventsResponse;
      };
      if (!json.ok || !json.data) return;

      const fresh = json.data.items.filter((it) => !seenIds.current.has(it.id));
      if (fresh.length === 0) return;
      for (const it of fresh) seenIds.current.add(it.id);

      // Список растёт только на то, что админ сам догрузил, плюс новые события.
      setItems((prev) => [...fresh, ...prev].sort((a, b) => b.timeMs - a.timeMs));
    } catch {
      // Silent — next poll will retry. Avoids surfacing transient
      // network blips as user-visible errors in a live dashboard.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      isVisible.current = document.visibilityState === "visible";
    };
    // PERF-27: начальное значение читается с документа, а не принимается за
    // «видно». Вкладка, открытая в фоне (Ctrl+click по ссылке на дашборд),
    // до первого переключения фокуса опрашивала API как активная — то есть
    // ровно в том случае, ради которого пауза и сделана.
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ADMIN-EVENTS-EXPORT: отказ выгрузки возвращает на дашборд с ?eventsExport=.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("eventsExport")) return;
    toast.error(T.exportFailed);
    params.delete("eventsExport");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [toast]);

  const loadMore = useCallback(async () => {
    if (nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchJson<AdminEventsResponse>(
        `/api/admin/dashboard/events?before=${nextBefore}&limit=${PAGE_SIZE}`,
        { cache: "no-store" },
      );
      const older = data.items.filter((it) => !seenIds.current.has(it.id));
      for (const it of older) seenIds.current.add(it.id);
      setItems((prev) => [...prev, ...older]);
      setNextBefore(data.nextBefore);
    } catch {
      // Листание без действия со стороны админа — своя строка, не серверная.
      toast.error(T.loadMoreFailed);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextBefore, toast]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isVisible.current) return;
      void poll(latestMs);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [latestMs, poll]);

  return (
    <section className="min-w-0 rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-base font-semibold text-text-main">
            {T.title}
          </h3>
          <LiveBadge />
        </div>
        <div className="flex items-center gap-2">
          <Select
            aria-label={T.exportPeriodLabel}
            value={exportDays}
            onChange={(event) => setExportDays(Number(event.target.value) as (typeof EXPORT_DAYS)[number])}
            className="h-9 w-auto py-0 text-xs"
          >
            {EXPORT_DAYS.map((days) => (
              <option key={days} value={days}>
                {T.exportPeriod(days)}
              </option>
            ))}
          </Select>
          <Button asChild variant="secondary" size="sm">
            {/* Без `download`: файл отдаёт Content-Disposition, а отказ —
                редирект на дашборд, который иначе скачался бы как HTML. */}
            <a href={`/api/admin/dashboard/events/export?days=${exportDays}`}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              {T.exportCta}
            </a>
          </Button>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-sec">{T.empty}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          {/* Фиксированная раскладка с долями колонок: таблица всегда в ширину
              карточки, длинное обрезается многоточием (полный текст — в title). */}
          <table className="w-full min-w-[480px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle">
                <th scope="col" className="eyebrow w-[17%] py-2 pr-3 font-normal">{T.columns.time}</th>
                <th scope="col" className="eyebrow w-[24%] py-2 pr-3 font-normal">{T.columns.type}</th>
                <th scope="col" className="eyebrow w-[24%] py-2 pr-3 font-normal">{T.columns.description}</th>
                <th scope="col" className="eyebrow w-[20%] py-2 pr-3 font-normal">{T.columns.detail}</th>
                <th scope="col" className="eyebrow w-[15%] py-2 text-right font-normal">{T.columns.amount}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event) => (
                <EventsFeedItem key={event.id} event={event} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextBefore !== null ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
            {T.loadMore}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 eyebrow">
      <span
        aria-hidden
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-success"
      />
      {T.liveBadge(POLL_MS / 1000)}
    </span>
  );
}

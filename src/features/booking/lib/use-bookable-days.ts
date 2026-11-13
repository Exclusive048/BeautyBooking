"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { mergeBookableDays, type BookableDaysSummary } from "@/lib/schedule/bookable-days-shared";

type Result = { key: string; summary: BookableDaysSummary | null; error: string | null };

/**
 * BOOKING-DATE-CALENDAR — сводка окна записи по дням (`?days=1` у
 * `/api/masters/{id}/availability` и `/api/public/providers/{id}/slots`) для
 * календаря выбора даты.
 *
 * Несколько адресов — «Любой мастер» студии: сводки сливаются
 * (`mergeBookableDays`, день свободен, если свободен хоть у кого-то). Отказ
 * части мастеров (услугу не оказывает, сбой) не мешает остальным; ошибка —
 * только когда не прочиталась ни одна сводка.
 *
 * Результат помечен ключом запроса: «идёт загрузка» и ошибка ВЫВОДЯТСЯ из
 * совпадения ключа, без синхронного setState в эффекте.
 */
export function useBookableDays({
  urls,
  withAuth = false,
  fallbackError,
}: {
  /** `null` или пусто — грузить нечего (не выбраны услуга или мастер). */
  urls: string[] | null;
  /** Кабинет: обновление сессии и уход на вход по 401 (`fetchJsonWithAuth`). */
  withAuth?: boolean;
  fallbackError: string;
}): { summary: BookableDaysSummary | null; loading: boolean; error: string | null; retry: () => void } {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const urlsKey = urls && urls.length > 0 ? urls.join("\n") : null;
  const requestKey = urlsKey ? `${nonce}\n${urlsKey}` : null;

  useEffect(() => {
    if (!requestKey || !urlsKey) return;
    let cancelled = false;
    const read = withAuth ? fetchJsonWithAuth : fetchJson;
    void Promise.allSettled(
      urlsKey.split("\n").map((url) => read<BookableDaysSummary>(url, { cache: "no-store" })),
    ).then((settled) => {
      if (cancelled) return;
      const summaries = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
      if (summaries.length > 0) {
        setResult({ key: requestKey, summary: mergeBookableDays(summaries), error: null });
        return;
      }
      const failure = settled.find((entry) => entry.status === "rejected");
      setResult({
        key: requestKey,
        summary: null,
        error: serverMessageOr(failure?.status === "rejected" ? failure.reason : null, fallbackError),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, urlsKey, withAuth, fallbackError]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  const current = result && result.key === requestKey ? result : null;
  return {
    summary: current?.summary ?? null,
    loading: requestKey !== null && current === null,
    error: current?.error ?? null,
    retry,
  };
}

/**
 * Адрес сводки дней (относительный — строится и при серверном рендере, где
 * `window` нет). Пустые параметры не уходят.
 */
export function bookableDaysUrl(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value) search.set(name, value);
  }
  search.set("days", "1");
  return `${path}?${search.toString()}`;
}

"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability/report";

/**
 * RES-17 — единственная реализация «что делает error boundary с ошибкой».
 *
 * До этого `reportError` во всём App Router встречался РОВНО ОДИН раз — в
 * `global-error.tsx`. Сегментные boundary (`(public)`, `(cabinet)`, `(admin)`)
 * слали только `POST /api/log-error`, а тот роут пишет `logError` и никуда не
 * форвардит. То есть всё, что падает в кабинетах и на публичных профилях —
 * там, где сосредоточен SSR-рендер, — в GlitchTip не попадало вовсе: трекер
 * видел только `onRequestError` (вылетевшее из роут-хендлера) и `fail()`
 * (явные 5xx). Дыра была ровно в самом насыщенном месте.
 *
 * Почему это хук, а не по строчке в каждом файле: boundary пять (четыре
 * сегментных + корневой из RES-06), поведение у них обязано быть одинаковым, а
 * расхождение здесь невидимо — «ошибок в трекере нет» читается как «ошибок
 * нет». Guard в `error-boundaries.test.ts` требует, чтобы каждый boundary шёл
 * через этот хук.
 *
 * Два канала намеренно оба: `reportError` — трекер (React-ошибка, пойманная
 * boundary, не доходит до `window.onerror`, поэтому её надо захватывать явно),
 * `POST /api/log-error` — структурный лог. Роут в GlitchTip не форвардит,
 * поэтому двойного репорта нет.
 */
export function useErrorBoundaryReport(error: Error & { digest?: string }): void {
  useEffect(() => {
    reportError(error, { level: "error", extra: { digest: error.digest } });

    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    }).catch(() => {});
  }, [error]);
}

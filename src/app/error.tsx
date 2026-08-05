"use client";

import { useErrorBoundaryReport } from "@/hooks/use-error-boundary-report";
import { ErrorState } from "@/components/ui/error-state";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.pages.error;

/**
 * RES-06 — корневой error boundary для роутов ВНЕ групп.
 *
 * Групповых boundary было три — `(public)`, `(cabinet)`, `(admin)`, — а
 * корневого не было вовсе. Значит серверная ошибка на любом ungrouped-роуте
 * (главная, `/catalog`, `/login`, `/book`, `/pricing`, `/notifications` и весь
 * статический хвост) уходила прямо в `global-error.tsx`, а тот заменяет
 * ДОКУМЕНТ целиком: свои `<html>`/`<body>`, инлайновые стили, ни навигации, ни
 * футера, ни `UI_TEXT`. Один упавший SSR-запрос — и вместо частичной
 * деградации внутри layout'а пользователь видел голую страницу.
 *
 * Особенно заметно на `/book`: это второй, самостоятельный вход в
 * бронирование, тогда как первый (`(public)/u/[username]/booking`) прикрыт
 * `(public)/error.tsx` — один флоу был защищён по-разному.
 *
 * `global-error.tsx` остаётся страховкой на отказ самого корневого layout'а.
 * Тексты и компонент — те же, что в `(public)/error.tsx`: ситуация для
 * пользователя одна и та же, значит и строка одна.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorBoundaryReport(error);

  return (
    <ErrorState
      variant="default"
      title={t.public.title}
      description={t.public.subtitle}
      primaryAction={{ label: t.retry, onClick: reset }}
      secondaryAction={{ label: t.goHome, href: "/" }}
    />
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  subtitle?: string;
  /** Строка-состояние под подсказкой (например, статус в каталоге). */
  note?: ReactNode;
  control: ReactNode;
  className?: string;
};

/**
 * Generic two-column row used across the Rules and Visibility tabs:
 * title + optional helper text on the left, the active control (chip group,
 * switch, etc.) on the right. Wraps onto two lines on narrow viewports.
 *
 * PWA-FIX-05 — ниже `sm` строка СТЕКАЕТСЯ: текст занимает всю ширину, контрол
 * уходит под него. Раньше `flex-1` у текста отдавал ему только остаток после
 * `shrink-0`-контрола, и на 375 px группа из четырёх чипов оставляла подписи
 * колонку в одно слово («Минимум / за», подсказка — в семь строк). Из-за этого
 * подсказки писались телеграфно, а объяснить «шаг окошек» без примера нельзя.
 */
export function SettingRow({ title, subtitle, note, control, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0",
        className
      )}
    >
      <div className="min-w-0 basis-full sm:flex-1">
        <p className="text-sm font-medium text-text-main">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-text-sec">{subtitle}</p> : null}
        {note ? <div className="mt-1">{note}</div> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

import React from "react";

import { cn } from "@/lib/cn";

export type NoticeTone = "danger" | "warning" | "success" | "info" | "muted";

const TONES: Record<NoticeTone, string> = {
  danger: "border-danger-border bg-danger-surface text-danger-text",
  warning: "border-warning-border bg-warning-surface text-warning-text",
  success: "border-success-border bg-success-surface text-success-text",
  info: "border-info-border bg-info-surface text-info-text",
  muted: "border-border bg-muted text-muted-foreground",
};

type Props = React.ComponentProps<"div"> & { tone: NoticeTone };

/**
 * Плашка состояния внутри формы или карточки: «Не удалось сохранить…»,
 * «Ссылка скопирована», «Расписание скоро закончится» (29.09 доработки · 23).
 *
 * Цвета — только статусные токены: тёмная тема встроена в переменные, поэтому
 * `dark:`-вилки вызывающему не нужны. Ошибка (`danger`) объявляется диктору
 * сразу (`role="alert"`), остальные тона — нет: их не надо зачитывать поверх
 * того, что человек делает. Отступы и радиус вызывающий может переопределить
 * (`cn` — tailwind-merge).
 */
export function Notice({ tone, className, role, ...props }: Props) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : undefined)}
      className={cn("rounded-xl border p-3 text-sm", TONES[tone], className)}
      {...props}
    />
  );
}

import { cn } from "@/lib/cn";
import React from "react";

/** `ref` — обычный проп (React 19): поиск и inline-edit фокусируют поле программно. */
type Props = React.ComponentProps<"input"> & {
  /**
   * `bare` — поле без своей рамки и заливки, внутри чужой (строка поиска в
   * шапке каталога, 29.09 доработки · 22). Фокус показывает базовое правило
   * `input:focus` в `globals.css` либо обёртка через `focus-within:`.
   */
  variant?: "default" | "bare";
};

const VARIANTS = {
  default: "lux-input h-11 w-full rounded-2xl px-4 text-sm text-text-main placeholder:text-text-placeholder outline-none",
  bare: "h-11 w-full bg-transparent text-sm text-text-main placeholder:text-text-placeholder outline-none",
} as const;

/**
 * Дефолты поля (`w-full`, `h-11`, `px-4`, `text-sm`) уступают `className`
 * вызывающего: `cn` — tailwind-merge, побеждает последний аргумент.
 *
 * История: пока `cn` был плоским join, побеждал порядок правил в бандле, и у
 * полей времени в редакторе часов ширина `w-[6.5rem]` не применялась (строка
 * дня занимала пять линий, PWA-FIX-12), а `px-3`/`h-10`/`text-base` у 35 полей
 * не применялись вовсе (29.09 доработки · 12).
 */
export function Input({ className, variant = "default", ...props }: Props) {
  return <input className={cn(VARIANTS[variant], className)} {...props} />;
}

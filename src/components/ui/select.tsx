import React from "react";
import { cn } from "@/lib/cn";

type Props = React.ComponentProps<"select"> & {
  /**
   * `borderless` — поле без собственной рамки и заливки, для размещения внутри
   * чужой рамки (сортировка «иконка + список» в шапке раздела, 29.09 доработки
   * · 22). Фокус у него остаётся: базовое правило `select:focus` в
   * `globals.css` рисует кольцо тенью, `rounded-md` задаёт ему форму.
   */
  variant?: "default" | "borderless";
};

const VARIANTS = {
  default: "lux-input h-11 w-full rounded-2xl px-4 text-sm text-text-main outline-none",
  borderless: "cursor-pointer rounded-md bg-transparent text-sm text-text-main outline-none",
} as const;

/**
 * `ref` приходит обычным пропом (React 19): inline-edit и фильтры фокусируют
 * список программно.
 */
export function Select({ className, variant = "default", ...props }: Props) {
  return <select className={cn(VARIANTS[variant], className)} {...props} />;
}

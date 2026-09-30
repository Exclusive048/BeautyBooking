import React from "react";

import { cn } from "@/lib/cn";

/**
 * Ползунок (29.09 доработки · 22): нативный `<input type="range">` в цвете
 * бренда (`accent-primary`). Дорожку и бегунок вызывающий может перерисовать
 * своими классами — как двойной ползунок цены в каталоге (`histogram-slider`).
 */
export function RangeInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="range" className={cn("cursor-pointer accent-primary", className)} {...props} />;
}

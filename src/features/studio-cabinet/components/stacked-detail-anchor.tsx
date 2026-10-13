"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { scrollBehavior } from "@/lib/ui/scroll";

type Props = {
  /** Что сейчас открыто в панели деталей (id мастера/услуги); `null` — ничего. */
  selectionKey: string | null;
  /** Медиазапрос, при котором панель стоит ПОД списком, а не рядом с ним. */
  stackedQuery: string;
  className?: string;
  children: ReactNode;
};

/**
 * UX-PASS-01: панель деталей рядом со списком на узком экране уезжает под
 * список, и выбор строки (`router.replace(…, { scroll: false })`) менял её
 * содержимое где-то ниже экрана — казалось, что клик ничего не сделал. При
 * СМЕНЕ выбора и только в раскладке «друг под другом» панель прокручивается
 * в зону видимости; первый рендер (выбор пришёл ссылкой) не прокручивается,
 * плавность — общим `scrollBehavior()` (ограничение движения).
 */
export function StackedDetailAnchor({
  selectionKey,
  stackedQuery,
  className,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prevKeyRef = useRef(selectionKey);

  useEffect(() => {
    if (prevKeyRef.current === selectionKey) return;
    prevKeyRef.current = selectionKey;
    if (!selectionKey) return;
    if (!window.matchMedia(stackedQuery).matches) return;
    ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [selectionKey, stackedQuery]);

  return (
    <div
      ref={ref}
      className={cn("scroll-mt-[calc(var(--topbar-h)+1rem)]", className)}
    >
      {children}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  /** Classes for the outer wrapper (border / rounded / bg). */
  wrapperClassName?: string;
  /** Classes for the inner scroll container (e.g. `overflow-x-auto` or `flex max-h-[70vh] overflow-auto`). */
  scrollClassName?: string;
  children: ReactNode;
};

/**
 * FIX-BATCH-E — horizontal-scroll container with edge "scroll shadows".
 *
 * The calendars (master week / studio day) hold more columns than fit at ≤1280,
 * but the native scroll was invisible (overlay scrollbars hide) so the last
 * columns read as simply cut off. This wraps the existing scroll container and
 * fades the left/right edge whenever there's more content that way — a clear,
 * cross-platform "there's more, scroll →" affordance. Presentational only; the
 * inner scroll element stays the scroll parent so sticky headers keep working.
 */
export function HScrollShadow({ wrapperClassName, scrollClassName, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setEdges({
        start: scrollLeft > 1,
        end: scrollLeft + clientWidth < scrollWidth - 1,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      <div ref={ref} className={cn("overflow-x-auto", scrollClassName)}>
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-bg-card to-transparent transition-opacity duration-200",
          edges.start ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-card to-transparent transition-opacity duration-200",
          edges.end ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

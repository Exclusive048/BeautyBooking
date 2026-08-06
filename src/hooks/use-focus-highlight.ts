"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { scrollBehavior } from "@/lib/ui/scroll";

/**
 * FIX-R2-06-B — shared deep-link focus reader for the booking/review-list
 * surfaces. Notification CTAs (booking created/confirmed/cancelled/rescheduled,
 * reminders, chat, review-left) deep-link with the canonical `?focus=<id>`
 * query param. Any list surface that renders rows with a stable
 * `data-focus-id="<id>"` attribute can adopt this hook (directly if it's a
 * client component, or via the `<FocusHighlighter />` island for server pages)
 * to scroll the target row into view + apply a transient highlight.
 *
 * Canonical param name: **`focus`** (was divergent `bookingId` / `focus` across
 * emitters before this fix). The id matched against `data-focus-id` is the same
 * internal id the emitter put in the URL — cabinet surfaces are internal
 * (rule-12 exception), so booking/review ids match 1:1.
 *
 * Graceful degrade: a missing / invalid / out-of-list (e.g. paginated-out) id
 * is a no-op — no scroll, no highlight, no throw.
 *
 * Accessibility: respects `prefers-reduced-motion` — instant scroll + a static
 * (non-pulsing) ring in that mode. The highlight is transient (auto-removed),
 * never a permanent style stuck on the row.
 */

export const FOCUS_PARAM = "focus";
const HIGHLIGHT_CLASS = "focus-row-highlight";
const HIGHLIGHT_MS = 2400;

/**
 * @param readySignal optional value that, when it changes, re-attempts the
 * scroll+highlight. Pass a list's loaded-row count (e.g. `bookings.length`) for
 * SWR/async surfaces whose rows aren't in the DOM on first mount. Server-rendered
 * surfaces (rows in the initial HTML) can omit it.
 */
export function useFocusHighlight(readySignal?: unknown): void {
  const searchParams = useSearchParams();
  const focusId = searchParams?.get(FOCUS_PARAM) ?? null;

  useEffect(() => {
    if (!focusId) return;
    if (typeof document === "undefined") return;

    let highlighted: HTMLElement | null = null;
    let removeTimer: ReturnType<typeof setTimeout> | null = null;

    // Defer to the next frame so server-rendered rows are present in the DOM
    // before we query for the target.
    const raf = requestAnimationFrame(() => {
      const escaped =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(focusId)
          : focusId.replace(/["\\]/g, "\\$&");
      const target = document.querySelector<HTMLElement>(`[data-focus-id="${escaped}"]`);
      if (!target) return; // graceful: id not on this page → no-op

      // UI-11: гейт был написан здесь верно и ТОЛЬКО здесь — остальные шесть
      // программных прокруток продукта жили с литералом. Инлайн заменён на
      // общий `scrollBehavior()`, чтобы правило имело одну реализацию, а не
      // одну правильную копию и шесть отсутствующих.
      target.scrollIntoView({
        behavior: scrollBehavior(),
        block: "center",
      });

      target.classList.add(HIGHLIGHT_CLASS);
      highlighted = target;
      removeTimer = setTimeout(() => {
        target.classList.remove(HIGHLIGHT_CLASS);
      }, HIGHLIGHT_MS);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (removeTimer) clearTimeout(removeTimer);
      if (highlighted) highlighted.classList.remove(HIGHLIGHT_CLASS);
    };
    // readySignal is a re-trigger for async-loaded lists (intentional extra dep).
  }, [focusId, readySignal]);
}

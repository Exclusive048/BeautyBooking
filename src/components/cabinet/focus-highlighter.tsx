"use client";

import { useFocusHighlight } from "@/hooks/use-focus-highlight";

/**
 * FIX-R2-06-B — client island that runs {@link useFocusHighlight} for
 * server-rendered list surfaces (master bookings, master dashboard, master
 * reviews). Drop it once anywhere inside a page whose rows carry
 * `data-focus-id`. Renders nothing. Client pages (e.g. client bookings) call
 * the hook directly instead.
 */
export function FocusHighlighter(): null {
  useFocusHighlight();
  return null;
}

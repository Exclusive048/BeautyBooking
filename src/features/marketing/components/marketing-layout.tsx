import type { ReactNode } from "react";

/**
 * Minimal wrapper for marketing pages (about, how-it-works, how-to-book).
 * Real composition lives in section components — this just sets the page
 * background and lets sections own their own padding/rhythm.
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="bg-bg-page">{children}</div>;
}

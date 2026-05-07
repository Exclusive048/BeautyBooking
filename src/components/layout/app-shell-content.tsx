"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Conditional content wrapper for `<AppShell>`. Marketing / public routes
 * keep the readable max-w-6xl column; cabinet and admin are workspace
 * surfaces that own their own layout, padding, and full viewport width.
 *
 * Continues the pattern already established in `<CityPromptOverlay>` —
 * "/cabinet" and "/admin" are explicitly treated as different from the
 * rest of the site. Implemented as a client component because pathname
 * isn't exposed to server components without middleware; the cost is
 * just one wrapping `<div>` reading a single hook — RSC children are
 * serialised through the boundary unchanged.
 */
export function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace =
    pathname.startsWith("/cabinet") || pathname.startsWith("/admin");
  return (
    <div
      className={cn(
        "w-full",
        isWorkspace ? "" : "mx-auto max-w-6xl px-4 py-6 md:py-10",
      )}
    >
      {children}
    </div>
  );
}

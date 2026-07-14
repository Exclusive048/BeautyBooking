"use client";

import { usePathname } from "next/navigation";

/**
 * FIX-VISUAL-POLISH G5 — the global marketing footer (О платформе / Для
 * клиентов / become-master CTA / legal line) belongs on public/marketing
 * pages, NOT inside the cabinet & admin workspace, where it rendered far
 * below short content with a ~480px dead cream gap above it.
 *
 * Mirrors the same `/cabinet` + `/admin` = "workspace" split that
 * `<AppShellContent>` and `<CityPromptOverlay>` already use. Client
 * component because pathname isn't available to server components without
 * middleware; the server-rendered `<Footer>` is passed through as children
 * and simply not mounted on workspace routes.
 */
export function ConditionalFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace =
    pathname.startsWith("/cabinet") || pathname.startsWith("/admin");
  if (isWorkspace) return null;
  return <>{children}</>;
}

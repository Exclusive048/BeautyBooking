"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    // FIX-24 (Item 1): forward the per-request CSP nonce so next-themes' injected
    // no-flash inline script carries it. Without the nonce, strict-dynamic blocks
    // that inline script on EVERY page (app-wide theme FOUC; seen at /login:31).
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      {children}
    </NextThemesProvider>
  );
}
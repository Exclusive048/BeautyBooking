"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  children: ReactNode;
};

/**
 * Client wrapper that adds a soft shadow to the navbar once the user has
 * scrolled past the top. Kept minimal so the parent <Topbar> can stay a
 * server component with Prisma access.
 */
export function TopbarShell({ children }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border-subtle/60 bg-bg-page/85 backdrop-blur-md transition-shadow duration-200",
        scrolled && "shadow-sm",
      )}
    >
      {children}
    </header>
  );
}

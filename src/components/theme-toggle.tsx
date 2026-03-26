"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type ThemeMode = "light" | "dark";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration: detect client mount to avoid SSR/client mismatch
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const canToggle = mounted && (isDark || resolvedTheme === "light");
  const icon = mounted ? (isDark ? "☾" : "☀") : "◐";

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={UI_TEXT.common.toggleTheme}
      onClick={() => {
        if (!canToggle) return;
        const next: ThemeMode = isDark ? "light" : "dark";
        setTheme(next);
      }}
      className="h-9 w-9 px-0"
    >
      {icon}
    </Button>
  );
}

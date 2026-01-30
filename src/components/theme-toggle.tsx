"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isLight = resolvedTheme === "light";
  const isReady = isDark || isLight;

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={isReady ? "Переключить тему" : "Тема"}
      onClick={() => {
        if (!isReady) return;
        const next: ThemeMode = isDark ? "light" : "dark";
        setTheme(next);
      }}
      className="h-9 w-9 px-0"
    >
      {isDark ? "☾" : isLight ? "☀" : "◐"}
    </Button>
  );
}

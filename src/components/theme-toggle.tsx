"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
    return null;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Переключить тему"
      onClick={() => {
        const next: ThemeMode = isDark ? "light" : "dark";
        setTheme(next);
      }}
      className="h-9 w-9 px-0"
    >
      {isDark ? "☾" : "☼"}
    </Button>
  );
}

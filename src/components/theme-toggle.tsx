"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

function applyTheme(next: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", next === "dark");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("theme");
    return stored === "dark" || stored === "light" ? stored : "light";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Переключить тему"
      onClick={() => {
        const next: ThemeMode = isDark ? "light" : "dark";
        setTheme(next);
        if (typeof window !== "undefined") {
          localStorage.setItem("theme", next);
        }
        applyTheme(next);
      }}
      className="h-9 w-9 px-0"
      suppressHydrationWarning
    >
      {isDark ? "☾" : "☼"}
    </Button>
  );
}

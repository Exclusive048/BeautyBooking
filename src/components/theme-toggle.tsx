"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" aria-label="Тема" className="h-9 w-9 px-0">
        ◐
      </Button>
    );
  }

  const isDark =
    resolvedTheme === "dark" || resolvedTheme === "light"
      ? resolvedTheme === "dark"
      : document.documentElement.classList.contains("dark");

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
      {isDark ? "☾" : "☀"}
    </Button>
  );
}

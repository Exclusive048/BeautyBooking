"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const canToggle = mounted && (isDark || resolvedTheme === "light");
  const icon = mounted ? (isDark ? "☾" : "☀") : "◐";

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Переключить тему"
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

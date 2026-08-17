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
export function isWorkspacePath(pathname: string): boolean {
  return pathname.startsWith("/cabinet") || pathname.startsWith("/admin");
}

/**
 * UI-30. Маршруты, у которых есть СВОЙ `<main>`: кабинеты и админка (шелл
 * оборачивает колонку контента, оставляя сайдбар снаружи лэндмарка) и
 * `/login` (свой `<main>` вокруг формы, рядом с бренд-панелью). На них общий
 * контейнер обязан быть нейтральным `<div>` — иначе в документе два
 * `main`-лэндмарка, и навигация по лэндмаркам (`D` в NVDA, ротор в
 * VoiceOver) перестаёт быть однозначной ровно там, где пользователь проводит
 * всё время. На остальных маршрутах лэндмарком становится этот контейнер, а
 * страница своего `<main>` не рендерит.
 *
 * Предикат экспортируется: на нём стоит `app-shell-landmark.test.ts`.
 */
export function routeProvidesOwnMain(pathname: string): boolean {
  return isWorkspacePath(pathname) || pathname === "/login";
}

export function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace = isWorkspacePath(pathname);
  const Tag = routeProvidesOwnMain(pathname) ? "div" : "main";
  return (
    <Tag
      className={cn(
        "w-full",
        isWorkspace ? "" : "mx-auto max-w-6xl px-4 py-6 md:py-10",
      )}
    >
      {children}
    </Tag>
  );
}

"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { BRAND_COLORS } from "@/lib/ui/brand-colors";

/**
 * PWA-FIX-07 — тинт браузерного/системного хрома (в standalone-PWA это полоса
 * со временем, зарядом и сетью) следует ТЕМЕ ПРИЛОЖЕНИЯ, а не системной
 * настройке.
 *
 * 🔴 Дефект. `viewport.themeColor` в `app/layout.tsx` объявлен двумя записями с
 * `media="(prefers-color-scheme: …)"`, а тему в продукте переключает
 * `next-themes` — он ставит класс на `<html>` и системную настройку НЕ меняет.
 * То есть медиазапрос после переключения остаётся тем же, и полоса статуса
 * сохраняет прежний цвет: пользователь переключил тему, весь интерфейс
 * перекрасился, а верхняя кромка экрана — нет.
 *
 * Почему отдельный `<meta>`, а не правка существующих: по спецификации браузер
 * берёт ПЕРВЫЙ `meta[name="theme-color"]`, чей `media` подходит (мета без
 * `media` подходит всегда). Поэтому достаточно держать одну мету без `media`
 * первой в `<head>` — она авторитетна независимо от того, что Next отрендерит
 * ниже и что он добавит при клиентской навигации. Существующие медиа-меты
 * остаются SSR-базой для первого кадра, пока JS не выполнился.
 *
 * Цвет — фон страницы (`--bg-page`), а не бренд-бордо: полоса статуса
 * примыкает к шапке (`bg-bg-page/85`), и совпадение с ней читается как
 * продолжение экрана, тогда как бордо давало чужеродную плашку, вообще не
 * реагирующую на тему. Литералы — из `brand-colors.ts` (инв. #40): это пятая
 * среда без Tailwind, значение уезжает в атрибут `content` строкой.
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // До гидратации `resolvedTheme` не определён — трогать мету нечем, SSR-база
    // (медиа-меты) в этот момент и так корректна для системной настройки.
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    const color =
      resolvedTheme === "dark" ? BRAND_COLORS.darkSurfacePage : BRAND_COLORS.surfacePage;

    let meta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][data-theme-color="app"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("data-theme-color", "app");
      // Первой в `<head>` — именно порядок делает её авторитетной.
      document.head.insertBefore(meta, document.head.firstChild);
    }
    if (meta.getAttribute("content") !== color) {
      meta.setAttribute("content", color);
    }
  }, [resolvedTheme]);

  return null;
}

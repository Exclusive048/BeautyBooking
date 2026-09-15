"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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
 * PWA-UX-BATCH-01 (2026-09-15) — почему прежняя форма («одна мета без `media`
 * первой в `<head>`») не держалась. Браузер берёт ПЕРВЫЙ подходящий
 * `meta[name="theme-color"]`, и порядок в `<head>` решает всё. Но порядок не
 * наш: при клиентской навигации Next/React 19 снимает и заново вставляет
 * hoistable-меты из `viewport`, и медиа-мета оказывается ВЫШЕ нашей — с этого
 * момента полоса статуса снова следует системной настройке (телефон в тёмной
 * системе + приложение в светлой теме = тёмная полоса над светлым экраном).
 * Ничего не перезапускало эффект (зависимость была только `resolvedTheme`).
 *
 * Теперь порядок не имеет значения: цвет выставляется ВСЕМ метам
 * `theme-color` (какая бы ни оказалась первой, значение одно), эффект
 * перезапускается на каждой навигации, а `MutationObserver` на `<head>`
 * перекрашивает мету, которую фреймворк вставил заново. `media`-атрибуты не
 * трогаются: React владеет этими узлами, и чужие правки атрибутов он не
 * ожидает; достаточно `content`.
 *
 * Цвет — фон страницы (`--bg-page`), а не бренд-бордо: полоса статуса
 * примыкает к шапке (`bg-bg-page/85`), и совпадение с ней читается как
 * продолжение экрана, тогда как бордо давало чужеродную плашку, вообще не
 * реагирующую на тему. Литералы — из `brand-colors.ts` (инв. #40): это пятая
 * среда без Tailwind, значение уезжает в атрибут `content` строкой. Тот же
 * цвет стоит в `manifest.webmanifest` (`theme_color`): Android читает его при
 * установке PWA и до первого рендера страницы.
 *
 * ⚠️ iOS standalone это не покрывает: там полоса статуса управляется
 * `apple-mobile-web-app-status-bar-style` (build-time строка), а не
 * `theme-color`.
 */
const THEME_META_SELECTOR = 'meta[name="theme-color"]';

function applyThemeColor(color: string): void {
  const metas = document.head.querySelectorAll<HTMLMetaElement>(THEME_META_SELECTOR);
  let hasApp = false;
  metas.forEach((meta) => {
    if (meta.getAttribute("data-theme-color") === "app") hasApp = true;
    if (meta.getAttribute("content") !== color) meta.setAttribute("content", color);
  });
  if (!hasApp) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("data-theme-color", "app");
    meta.setAttribute("content", color);
    document.head.insertBefore(meta, document.head.firstChild);
  }
}

export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    // До гидратации `resolvedTheme` не определён — трогать мету нечем, SSR-база
    // (медиа-меты) в этот момент и так корректна для системной настройки.
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    const color =
      resolvedTheme === "dark" ? BRAND_COLORS.darkSurfacePage : BRAND_COLORS.surfacePage;

    applyThemeColor(color);

    // Меты, вставленные фреймворком позже (навигация, стриминг), получают тот
    // же цвет. Наблюдаем только добавление узлов: правка `content` на самих
    // метах в `childList` не попадает, петли нет.
    const observer = new MutationObserver((mutations) => {
      const added = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) => node instanceof HTMLMetaElement && node.getAttribute("name") === "theme-color",
        ),
      );
      if (added) applyThemeColor(color);
    });
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
    // `pathname` — намеренно в зависимостях: см. шапку файла.
  }, [resolvedTheme, pathname]);

  return null;
}

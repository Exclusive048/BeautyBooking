import type { Metadata } from "next";
import { versionedBrandUrl } from "@/lib/pwa/brand-asset-version";

/**
 * Иконки сайта для `<head>` (SEO-FAVICON-01; набор «Наложение» BRAND-ICONS-03
 * 2026-10-06, до него — BRAND-ICONS-02).
 *
 * Список собран под требования Яндекса к фавиконке: SVG (рекомендуется) либо
 * PNG 120×120 / 32×32 / 16×16, а при нескольких ссылках «робот может выбрать
 * любую». Поэтому сюда не попадают размеры вне этого набора: 192 и 512 нужны
 * только установленному приложению и живут в `/brand/manifest.webmanifest`.
 *
 * `/favicon.ico` (16/32/48, `sizes="48x48"`) Next ставит сам из
 * `src/app/favicon.ico` — это тот же файл, что `/brand/favicon.ico` из набора,
 * но по корневому адресу, который браузеры и роботы запрашивают и без ссылки.
 *
 * `favicon.svg` — плитка с КРУПНЫМ знаком (читается в 16–32 px) и сама
 * переключается на тёмную плитку с розовым знаком при тёмной теме браузера
 * (`prefers-color-scheme` внутри SVG: вкладка лежит на панели браузера, а не
 * на странице, поэтому следует теме браузера, а не переключателю сайта).
 * `icon-120.png` — как остальной PNG-ряд; в наборе дизайнера его нет — его
 * собирает `npm run generate:icons` из `icon-1024.png`.
 *
 * Каждый адрес — с `?v=` версии набора (`versionedBrandUrl`,
 * BRAND-ICONS-CACHE-01): иначе после смены знака кэши отдают прежний.
 */
export const SITE_ICONS = {
  icon: [
    { url: versionedBrandUrl("/brand/favicon.svg"), sizes: "any", type: "image/svg+xml" },
    { url: versionedBrandUrl("/brand/icon-120.png"), sizes: "120x120", type: "image/png" },
    // Запасной PNG для клиентов без SVG-фавиконок.
    { url: versionedBrandUrl("/brand/favicon.png"), sizes: "32x32", type: "image/png" },
  ],
  apple: [{ url: versionedBrandUrl("/brand/apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
  // Safari: закреплённая вкладка и Touch Bar — силуэт, окрашенный `color`.
  other: [{ rel: "mask-icon", url: versionedBrandUrl("/brand/mask-icon.svg"), color: "#a10728" }],
} satisfies NonNullable<Metadata["icons"]>;

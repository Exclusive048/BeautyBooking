import type { Viewport } from "next";

/**
 * PWA-ZOOM-01 — вьюпорт сайта и его iOS-поправка.
 *
 * EXP-033 убрал `maximumScale: 1` + `userScalable: false` целиком, чтобы не
 * отнимать pinch-zoom (WCAG 1.4.4). Побочный эффект проявился только на iOS:
 * общие поля ввода набраны 14px, а Safari при фокусе на поле мельче 16px сам
 * приближает страницу и обратно не отдаляет. Дальше страница живёт увеличенной,
 * и шапка с нижней панелью (они держатся за layout-viewport, а не за видимую
 * область) «ездят» за прокруткой и встают на место рывком — это и было
 * «случайное зазумливание» и «навбар двигается при скролле» из замечаний.
 *
 * `maximum-scale=1` на iOS гасит ровно автоприближение: жест щипка Safari с
 * iOS 10 этот предел игнорирует, так что зум для слабовидящих остаётся.
 * Android поля при фокусе не приближает, а Chrome предел для щипка как раз
 * СОБЛЮДАЕТ — поэтому поправка только для iOS, остальным вьюпорт прежний.
 */
export const BASE_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // PWA-FIX-07: тинт хрома = фон страницы (`--bg-page`), чтобы полоса статуса
  // читалась продолжением шапки, а не отдельной бордовой плашкой. Эти две
  // записи — SSR-база первого кадра (верна для системной настройки); дальше
  // мету перебивает `<ThemeColorMeta>`, потому что тему в продукте переключает
  // `next-themes`, а он `prefers-color-scheme` не меняет. Значения зеркалят
  // `BRAND_COLORS.surfacePage` / `.darkSurfacePage` (инв. #40).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F0EA" },
    { media: "(prefers-color-scheme: dark)", color: "#1F1417" },
  ],
};

/**
 * iPhone / iPod / iPad со «своим» UA. iPadOS в режиме «сайт для компьютера»
 * представляется Macintosh и сервером не отличим — он остаётся на базовом
 * вьюпорте (как было до этой правки).
 */
export function isIosUserAgent(userAgent: string | null | undefined): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(userAgent ?? "");
}

export function resolveViewport(userAgent: string | null | undefined): Viewport {
  // `userScalable: false` не ставится намеренно: он и есть запрет щипка.
  return isIosUserAgent(userAgent) ? { ...BASE_VIEWPORT, maximumScale: 1 } : BASE_VIEWPORT;
}

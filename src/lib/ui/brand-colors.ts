/**
 * Бренд-палитра для сред, куда Tailwind и CSS-переменные не доходят.
 *
 * Потребители — пять таких сред, и ни одна из них не может читать
 * `globals.css`:
 *   • HTML транзакционной почты (`lib/email/templates/*`) — рендерит почтовый
 *     клиент получателя: ни переменных, ни классов, ни темы;
 *   • canvas-постеры кабинета (`ctx.fillStyle` принимает только строку цвета);
 *   • OG-превью через `next/og` (satori понимает только инлайновые стили);
 *   • `app/global-error.tsx` — рендерится при падении root-layout, то есть
 *     Tailwind недоступен по определению;
 *   • `components/theme-color-meta.tsx` (PWA-FIX-07) — атрибут `content` у
 *     `<meta name="theme-color">` принимает только строку цвета, а тинт полосы
 *     статуса обязан совпадать с `--bg-page` активной темы.
 *
 * Значения байт-в-байт зеркалят CSS-переменные из `src/app/globals.css`
 * (`:root` и `.dark`). Зеркало — это токен, живущий в двух местах, а такой
 * токен расходится молча (HARDENING-MISC-01), поэтому совпадение проверяет
 * `brand-colors.test.ts`: он читает `globals.css` и сверяет каждую константу.
 *
 * Два набора поверхностей — светлый и тёмный — здесь не «тема продукта», а
 * фиксированное оформление артефакта: письмо и печатная карточка всегда
 * светлые, share-постер и OG-карточка всегда тёмные, а `global-error`
 * переключается по `prefers-color-scheme`.
 */
export const BRAND_COLORS = {
  /* === Бренд-градиент — одинаков в обеих темах === */
  /** `--brand-from` — глубокий бордо. */
  brandFrom: "#720808",
  /** `--brand-via` — малиновый, средняя точка градиента. */
  brandVia: "#A10728",
  /** `--brand-deep` — самый тёмный бордо. */
  brandDeep: "#560505",
  /** `--brand-pane` — бренд-поверхность, тёмная в ОБЕИХ темах (сцена логина). */
  brandPane: "#3A040C",
  /** `--brand-accent` — тёплый песок; здесь используется как акцент рейтинга. */
  brandAccent: "#C6A97E",
  /** `--primary-foreground` (`:root`) — текст поверх бренд-заливки. */
  textOnBrand: "#FFFFFF",

  /* === Светлые поверхности (`:root`) === */
  /** `--bg-page` — кремовая бумага. */
  surfacePage: "#F6F0EA",
  /** `--bg-card` — приподнятая карточка. */
  surfaceCard: "#FFFCF8",
  /** `--text-main` — бордово-чёрный основной текст. */
  textMain: "#2A0A10",
  /** `--text-label` — усиленная подпись, между main и sec. */
  textLabel: "#56262E",
  /** `--text-sec` — приглушённый вторичный текст. */
  textSecondary: "#876770",
  /** `--border-subtle` — тёплая тауп-граница. */
  borderSubtle: "#E0D0C8",

  /* === Тёмные поверхности (`.dark`) === */
  /** `.dark --bg-page` — тёплый угольный фон. */
  darkSurfacePage: "#1F1417",
  /** `.dark --bg-card` — приподнятая тёмная карточка. */
  darkSurfaceCard: "#302026",
  /** `.dark --text-main` — основной текст на тёмном. */
  darkTextMain: "#FDF2F0",
  /** `.dark --text-sec` — вторичный текст на тёмном. */
  darkTextSecondary: "#C79BA2",
  /** `.dark --border-subtle` — бордовая граница на тёмном. */
  darkBorderSubtle: "#5A1820",
} as const;

/**
 * Канонический бренд-градиент той же формы, что утилита `bg-brand-gradient`
 * в `tailwind.config.js`: те же три стопа и те же проценты. Расхождение с
 * утилитой ловит `brand-colors.test.ts`.
 */
export function brandGradientCss(direction = "135deg"): string {
  return `linear-gradient(${direction}, ${BRAND_COLORS.brandFrom} 0%, ${BRAND_COLORS.brandVia} 55%, ${BRAND_COLORS.brandDeep} 100%)`;
}

/**
 * `rgba()` от бренд-константы. Нужен там же, где и сами константы: в письме,
 * на canvas и в satori нет `rgb(var(--x) / a)`, а полупрозрачные границы и
 * тени в этих артефактах есть.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

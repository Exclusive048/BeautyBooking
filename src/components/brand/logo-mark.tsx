import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * `themed` — знак меняется вместе с темой сайта (`mark-light` / `mark-dark`
 * набора «Наложение»); `fixedDark` — всегда тёмная версия, для поверхности,
 * тёмной в обеих темах (панель бренда на `/login`).
 */
export type LogoMarkVariant = "themed" | "fixedDark";

type Props = {
  size: number;
  variant?: LogoMarkVariant;
  className?: string;
};

// Классы стопов перечислены целиком — Tailwind находит их в исходнике.
const STOP_CLASSES: Record<LogoMarkVariant, readonly [string, string, string]> = {
  themed: ["text-logo-mark-from", "text-logo-mark-via", "text-logo-mark-to"],
  fixedDark: ["text-logo-mark-fixed-from", "text-logo-mark-fixed-via", "text-logo-mark-fixed-to"],
};

// Четыре лепестка-линзы, поле 100×100 — дословно из `svg/mark-*.svg` набора.
const PETALS = [
  "M6 6 A46 46 0 0 1 62 62 A46 46 0 0 1 6 6Z",
  "M94 6 A46 46 0 0 1 38 62 A46 46 0 0 1 94 6Z",
  "M94 94 A46 46 0 0 1 38 38 A46 46 0 0 1 94 94Z",
  "M6 94 A46 46 0 0 1 62 38 A46 46 0 0 1 6 94Z",
] as const;

/**
 * Знак бренда (BRAND-ICONS-03).
 *
 * Инлайн-SVG, а не файл: цвета градиента — токены `--logo-mark-*` из
 * `globals.css` (пара `:root` / `.dark`), поэтому знак в шапке и сайдбарах
 * переключается вместе с темой в тот же кадр, без второго запроса и без
 * мигания при гидратации. Полупрозрачные лепестки (`fill-opacity` 0.5)
 * накладываются — отсюда название набора.
 *
 * `aria-hidden`: каждый `<BrandLogo>` либо обёрнут в `<Link aria-label>`,
 * либо стоит рядом со словесным знаком — сам знак декоративен.
 */
export function LogoMark({ size, variant = "themed", className }: Props) {
  // Свой id на каждый экземпляр: знак бывает на странице несколько раз
  // (шапка, футер), а ссылка `url(#…)` на чужой, скрытый градиент не рисуется.
  const gradientId = `logo-mark-${useId().replace(/[^\w-]/g, "")}`;
  const [from, via, to] = STOP_CLASSES[variant];

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn("inline-block shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0" className={cn(from, "[stop-color:currentColor]")} />
          <stop offset="0.5" className={cn(via, "[stop-color:currentColor]")} />
          <stop offset="1" className={cn(to, "[stop-color:currentColor]")} />
        </linearGradient>
      </defs>
      {PETALS.map((d) => (
        <path key={d} d={d} fill={`url(#${gradientId})`} fillOpacity={0.5} />
      ))}
    </svg>
  );
}

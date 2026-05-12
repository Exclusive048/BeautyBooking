import Link from "next/link";
import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/brand/logo-mark";
import { UI_TEXT } from "@/lib/ui/text";

export type BrandLogoVariant = "full" | "iconOnly" | "monoText";
export type BrandLogoSize = "xs" | "sm" | "md" | "lg" | "xl";
export type BrandLogoMark = "gradient" | "mono";

type Preset = {
  icon: number;
  text: string;
  gap: string;
};

const SIZE_PRESETS: Record<BrandLogoSize, Preset> = {
  xs: { icon: 20, text: "text-sm", gap: "gap-1.5" },
  sm: { icon: 24, text: "text-base", gap: "gap-2" },
  md: { icon: 32, text: "text-xl", gap: "gap-2.5" },
  lg: { icon: 48, text: "text-2xl", gap: "gap-3" },
  xl: { icon: 80, text: "text-5xl", gap: "gap-4" },
};

type Props = {
  /** `full` — icon + wordmark; `iconOnly` — just the mark;
   * `monoText` — wordmark only, rendered in `text-main`. */
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  /** Iconmark style. Default `gradient` — colour version of the
   * brand mark; `mono` for placement on solid brand-coloured
   * surfaces where the colour version would blend in. */
  mark?: BrandLogoMark;
  /** Pass `null` to render without an enclosing `<Link>` (useful in
   * hero sections that should not navigate). Default `"/"`. */
  href?: string | null;
  className?: string;
  /** Override wordmark colour. By default `variant="full"` renders
   * the wordmark with a brand-gradient text-clip; passing
   * `textClassName="text-white"` (or any explicit colour) wins via
   * CSS specificity — used on dark hero surfaces. */
  textClassName?: string;
  iconClassName?: string;
  /** Defaults to true on `xl` size (login hero) — we want LCP to
   * include the logo. */
  priority?: boolean;
};

/**
 * Universal brand logo (brand-kit).
 *
 * Pairs the SVG iconmark from `/brand/` with the wordmark
 * «МастерРядом». Single source of truth for logo presentation
 * across the cabinet, marketing, auth and error surfaces.
 *
 * Visual contract:
 *   - `full` (default) — gradient mark + gradient-clipped wordmark
 *   - `iconOnly` — just the SVG mark
 *   - `monoText` — wordmark only (no icon), single colour
 *
 * The brand gradient on the wordmark uses the existing
 * `bg-brand-gradient` utility (defined in tailwind config since
 * fix-01) so the rendered colours track the design tokens.
 */
export function BrandLogo({
  variant = "full",
  size = "md",
  mark = "gradient",
  href = "/",
  className,
  textClassName,
  iconClassName,
  priority,
}: Props) {
  const preset = SIZE_PRESETS[size];
  const shouldShowMark = variant !== "monoText";
  const shouldShowText = variant !== "iconOnly";
  const usePriority = priority ?? size === "xl";

  const content = (
    <span className={cn("inline-flex items-center", preset.gap, className)}>
      {shouldShowMark ? (
        <LogoMark
          size={preset.icon}
          variant={mark}
          priority={usePriority}
          className={iconClassName}
        />
      ) : null}
      {shouldShowText ? (
        <span
          className={cn(
            preset.text,
            "font-display font-semibold leading-none tracking-tight",
            variant === "full"
              ? "bg-brand-gradient bg-clip-text text-transparent"
              : "text-text-main",
            textClassName,
          )}
        >
          {UI_TEXT.brand.name}
        </span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={UI_TEXT.brand.name}
        className="inline-flex items-center"
      >
        {content}
      </Link>
    );
  }

  return content;
}

import Image from "next/image";
import { cn } from "@/lib/cn";

type LogoMarkVariant = "gradient" | "mono";

type Props = {
  size: number;
  variant?: LogoMarkVariant;
  className?: string;
  priority?: boolean;
};

/**
 * Brand iconmark renderer.
 *
 * `gradient` (default) uses `/brand/logo.svg` — the colour version
 * with the burgundy → rose gradient baked in. Works on neutral and
 * light surfaces out of the box.
 *
 * `mono` uses `/brand/logo-mono.svg` — single-fill SVG suitable for
 * placement on top of a solid brand-gradient background where the
 * colour version would visually blend.
 *
 * `alt=""` because every `<BrandLogo>` callsite either wraps in an
 * `aria-label`ed `<Link>` or appends a text wordmark — making the
 * mark itself decorative.
 */
export function LogoMark({ size, variant = "gradient", className, priority }: Props) {
  const src = variant === "mono" ? "/brand/logo-mono.svg" : "/brand/logo.svg";
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={cn("inline-block shrink-0", className)}
    />
  );
}

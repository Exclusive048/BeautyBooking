import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "icon"
  | "wrapper"
  | "inverted";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "none";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-accent-foreground shadow-card hover:brightness-[1.03] hover:shadow-hover focus-visible:ring-2 focus-visible:ring-primary-glow/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
  secondary:
    "border border-border-subtle/80 bg-bg-input text-text-main shadow-[inset_0_1px_0_rgb(255_255_255/0.28)] hover:border-border-subtle hover:bg-bg-card focus-visible:ring-2 focus-visible:ring-primary-glow/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
  ghost:
    "bg-transparent text-text-main hover:bg-bg-input/85 focus-visible:ring-2 focus-visible:ring-primary-glow/35",
  // Fixed light fill (white, same in both themes) MUST pair with a fixed dark
  // text token — never a theme-reactive one like `text-text-main`, which flips
  // near-white in dark and disappears on the white pill. `text-primary` is the
  // sanctioned fixed-light-fill pairing (burgundy in both themes: #720808 light
  // / #7A102C dark — never flips light). Own dedicated variant (not `secondary`
  // + a className override) so no competing `text-text-main` is injected: `cn`
  // is a plain join, so an override does NOT reliably win over the variant token
  // (FIX-ROUND-02). Use on brand-gradient / burgundy surfaces.
  inverted:
    "border border-transparent bg-white text-primary hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-red-500",
  icon:
    "border border-border-subtle/80 bg-bg-input text-text-main hover:bg-bg-card focus-visible:ring-2 focus-visible:ring-primary-glow/45",
  wrapper:
    "bg-transparent text-inherit hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary-glow/35",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  icon: "h-10 w-10 p-0 text-sm",
  none: "",
};

const WRAPPER_BASE =
  "transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none";
const DEFAULT_BASE =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all duration-300 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none";

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  type,
  ...props
}: Props) {
  const Comp = asChild ? Slot : "button";
  const base = variant === "wrapper" ? WRAPPER_BASE : DEFAULT_BASE;
  const resolvedSize = size === "none" || variant === "wrapper" ? sizes.none : sizes[size];

  return (
    <Comp
      className={cn(base, variants[variant], resolvedSize, className)}
      {...(!asChild ? { type: type ?? "button" } : {})}
      {...props}
    />
  );
}

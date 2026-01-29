import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[rgb(var(--accent-foreground))] hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-ring",
  secondary:
    "border border-border bg-surface text-text hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
  ghost:
    "bg-transparent text-text hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-red-500",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  type,
  ...props
}: Props) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...(!asChild ? { type: type ?? "button" } : {})}
      {...props}
    />
  );
}
import React from "react";
import { cn } from "@/lib/cn";

type ChipVariant = "default" | "active";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ChipVariant;
};

const variants: Record<ChipVariant, string> = {
  default:
    "border border-border-subtle bg-bg-card/65 text-text-main hover:bg-bg-card",
  active:
    "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-[rgb(var(--accent-foreground))] shadow-card",
};

export function Chip({
  className,
  variant = "default",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        "rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

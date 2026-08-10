import { cn } from "@/lib/cn";
import React from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";

// UI-26/27 (AUDIT-CAMPAIGN-02 п.8): статусные варианты переведены на токены
// поверхностей (--success-surface/-text/-border и т.д., globals.css) — Badge
// был ИСТОЧНИКОМ этих значений (контраст-ревью пройден раньше) и стал их
// эталонным потребителем. Пиксели идентичны прежним литеральным emerald/amber/
// red/blue-комбинациям (значения перенесены 1:1, включая альфу тёмной темы);
// `dark:`-вилки ушли в переменные тем.
const variantClasses: Record<BadgeVariant, string> = {
  default: "border-border-subtle bg-bg-input text-text-main",
  success: "border-success-border bg-success-surface text-success-text",
  warning: "border-warning-border bg-warning-surface text-warning-text",
  danger: "border-danger-border bg-danger-surface text-danger-text",
  info: "border-info-border bg-info-surface text-info-text",
  muted: "border-border bg-muted text-muted-foreground",
};

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

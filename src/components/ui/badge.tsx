import { cn } from "@/lib/cn";
import { defaultUnlessOverridden } from "@/lib/ui/class-groups";
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
      // CN-CONFLICT-CLASS: отступы — дефолт, а не приказ. `.px-3` 5160 и
      // `.py-1` 5210 стоят ПОЗЖЕ более узких значений вызывающего (`px-1.5`,
      // `px-2`, `py-0`), поэтому компактные бейджи каталога и карточки недели
      // молча получали штатные 12/4 px. Радиус и рамка оставлены жёсткими:
      // они и есть форма бейджа, а переопределяют их ровно те три сайта,
      // которым по правилу SKILL.md §16 полагается вариант, а не override.
      className={cn(
        "inline-flex items-center rounded-full border text-xs",
        defaultUnlessOverridden(className, "padding-x", "px-3"),
        defaultUnlessOverridden(className, "padding-y", "py-1"),
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

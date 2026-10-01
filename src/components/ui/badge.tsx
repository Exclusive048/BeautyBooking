import { cn } from "@/lib/cn";
import React from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";
type BadgeSize = "md" | "xs";

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

// 29.09 доработки · 25 (UI-22): `xs` — плашка состояния в строке списка
// («Неактивна», «Есть ответ», «VIP»): моноширинный 10px, прописные, разрядка
// `tracking-wide`. Цвет — только из варианта; отступы вызывающий может
// переопределить (`cn` отдаёт его класс).
const sizeClasses: Record<BadgeSize, string> = {
  md: "",
  xs: "px-2 py-0.5 font-mono text-3xs uppercase tracking-wide",
};

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
};

export function Badge({ className, variant = "default", size = "md", ...props }: BadgeProps) {
  return (
    <span
      // Отступы — дефолт: `cn` (tailwind-merge) отдаёт `px-*`/`py-*`
      // вызывающего, поэтому компактные бейджи каталога и недели получают свои
      // значения (CN-CONFLICT-CLASS закрывал это `defaultUnlessOverridden`).
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

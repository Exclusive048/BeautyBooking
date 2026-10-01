import { cn } from "@/lib/cn";
import React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "lux-card rounded-3xl bg-bg-card",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 md:p-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // Отступы — дефолт: `p-*` вызывающего перебивает `px-5 pb-5` (`cn` —
  // tailwind-merge). ⚠️ Но только на СВОЁМ брейкпоинте: `md:px-6 md:pb-6`
  // снимает лишь `md:p-*`, поэтому «везде p-5» пишется `p-5 md:p-5`.
  return <div className={cn("px-5 pb-5 md:px-6 md:pb-6", className)} {...props} />;
}

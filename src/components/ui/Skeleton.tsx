import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: Props) {
  return (
    <div
      // `rounded-xl` — дефолт: радиус вызывающего побеждает (`cn` —
      // tailwind-merge). До него `.rounded-xl` стоял в бандле позже
      // `.rounded-full`, и 14 плейсхолдеров аватара рендерились квадратами
      // (CN-CONFLICT-CLASS).
      className={cn("animate-pulse rounded-xl bg-bg-input/50", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

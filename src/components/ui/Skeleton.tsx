import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { defaultUnlessOverridden } from "@/lib/ui/class-groups";

type Props = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: Props) {
  return (
    <div
      // CN-CONFLICT-CLASS: `rounded-xl` — дефолт, а не приказ. Замер бандла:
      // `.rounded-2xl` 3405 · `.rounded-full` 3449 · `.rounded-lg` 3453 ·
      // `.rounded-xl` 3469 — то есть дефолт стоял ПОЗЖЕ всех трёх и съедал их.
      // Цена: 34 сайта, где автор просил другой радиус и молча его не получал,
      // из них 14 — `rounded-full` на плейсхолдерах аватара, то есть кружки
      // рендерились скруглёнными квадратами. Ни один гейт этого не видит:
      // класс в разметке есть, правило в бандле есть, оно просто проигрывает
      // (это ДРУГОЙ дефект, чем UI-01/02/03 — там правило не генерируется вовсе,
      // и его ловит `check:dead-classes`).
      className={cn(
        "animate-pulse bg-bg-input/50",
        defaultUnlessOverridden(className, "radius", "rounded-xl"),
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

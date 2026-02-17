import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: Props) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-neutral-200/70 dark:bg-neutral-800/70",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

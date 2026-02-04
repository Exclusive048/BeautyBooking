import React from "react";
import { cn } from "@/lib/cn";

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: Props) {
  return (
    <select
      className={cn(
        "lux-input h-11 w-full rounded-2xl px-4 text-sm text-text-main outline-none",
        className
      )}
      {...props}
    />
  );
}

import { cn } from "@/lib/cn";
import React from "react";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border-subtle bg-bg-input px-3 py-1 text-xs text-text-main",
        className
      )}
      {...props}
    />
  );
}

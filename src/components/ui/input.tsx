import { cn } from "@/lib/cn";
import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border border-border bg-input px-4 text-sm text-text placeholder:text-text-muted outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40",
        className
      )}
      {...props}
    />
  );
}
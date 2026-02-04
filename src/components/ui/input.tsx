import { cn } from "@/lib/cn";
import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "lux-input h-11 w-full rounded-2xl px-4 text-sm text-text-main placeholder:text-text-sec outline-none",
        className
      )}
      {...props}
    />
  );
}

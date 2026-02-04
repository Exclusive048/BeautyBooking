import React from "react";
import { cn } from "@/lib/cn";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: Props) {
  return (
    <textarea
      className={cn(
        "lux-input min-h-[110px] w-full rounded-2xl px-4 py-3 text-sm text-text-main placeholder:text-text-placeholder outline-none",
        className
      )}
      {...props}
    />
  );
}

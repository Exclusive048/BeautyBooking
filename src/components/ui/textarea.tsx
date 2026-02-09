import React from "react";
import { cn } from "@/lib/cn";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, Props>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "lux-input min-h-[110px] w-full rounded-2xl px-4 py-3 text-sm text-text-main placeholder:text-text-placeholder outline-none",
        className
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

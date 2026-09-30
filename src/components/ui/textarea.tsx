import React from "react";
import { cn } from "@/lib/cn";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /**
   * `bare` — поле без своей рамки и заливки внутри чужой (поле сообщения в
   * чате, 29.09 доработки · 22): рамку и фокус рисует панель сообщения.
   */
  variant?: "default" | "bare";
};

const VARIANTS = {
  default:
    "lux-input min-h-[110px] w-full rounded-2xl px-4 py-3 text-sm text-text-main placeholder:text-text-placeholder outline-none",
  bare: "w-full bg-transparent text-sm text-text-main placeholder:text-text-placeholder outline-none",
} as const;

export const Textarea = React.forwardRef<HTMLTextAreaElement, Props>(({ className, variant = "default", ...props }, ref) => {
  return <textarea ref={ref} className={cn(VARIANTS[variant], className)} {...props} />;
});

Textarea.displayName = "Textarea";

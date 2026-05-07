"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.detail;

type Props = {
  value: string;
};

/**
 * Tiny copy-to-clipboard button used in the detail header. Shows a
 * one-shot "Скопировано" check for 1.5s on success, then reverts. Falls
 * back silently when the Clipboard API is unavailable (older Safari /
 * insecure context) — caller can still long-press the contact text.
 */
export function CopyButton({ value }: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — Clipboard API not available in this context.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={T.copyAria}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        copied
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
          : "text-text-sec hover:bg-bg-input hover:text-text-main"
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { AutosaveStatus } from "./use-autosave";

const T = UI_TEXT.cabinetMaster.profile.editable;

type Props = {
  status: AutosaveStatus;
  className?: string;
};

/**
 * Tiny chip that mirrors the autosave hook's status. Stays mounted but
 * fades to invisible on `idle` so the row layout doesn't jump.
 */
export function SaveStatusChip({ status, className }: Props) {
  const visible = status === "saving" || status === "saved" || status === "error";
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 text-[11px] transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        status === "saving" && "text-text-sec",
        status === "saved" && "text-success-text",
        status === "error" && "text-danger-text",
        className
      )}
    >
      {status === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          {T.savingLabel}
        </>
      ) : status === "saved" ? (
        <>
          <Check className="h-3 w-3" aria-hidden />
          {T.savedLabel}
        </>
      ) : status === "error" ? (
        <span>{T.errorMessage}</span>
      ) : null}
    </span>
  );
}

"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { useSaveStatus } from "./save-status-provider";

const T = UI_TEXT.cabinetMaster.scheduleSettings.saveStatus;

/**
 * Auto-save status chip rendered in the page-header actions slot. Reads
 * from <SaveStatusProvider>; the form mounted below the header writes the
 * transitions. Hidden when status is "idle" so the chrome stays quiet
 * when nothing is happening.
 */
export function SaveStatusIndicator() {
  const { status, errorMessage } = useSaveStatus();

  if (status === "idle") return null;

  if (status === "saving") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-card px-2.5 py-1 text-xs text-text-sec"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {T.saving}
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-300"
      >
        <Check className="h-3 w-3" aria-hidden />
        {T.saved}
      </span>
    );
  }

  return (
    <span
      role="alert"
      title={errorMessage ?? undefined}
      className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-300"
    >
      <AlertCircle className="h-3 w-3" aria-hidden />
      {T.error}
    </span>
  );
}

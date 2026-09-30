"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
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
        className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-surface px-2.5 py-1 text-xs text-success-text"
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
      className="inline-flex items-center gap-1.5 rounded-full border border-danger-border bg-danger-surface px-2.5 py-1 text-xs text-danger-text"
    >
      <AlertCircle className="h-3 w-3" aria-hidden />
      {T.error}
    </span>
  );
}

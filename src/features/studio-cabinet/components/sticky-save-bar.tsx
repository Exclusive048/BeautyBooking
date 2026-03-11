"use client";

import { Check } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  onSave: () => void;
  isSaving?: boolean;
  saved?: boolean;
  error?: string | null;
  disabled?: boolean;
};

export function StickySaveBar({
  onSave,
  isSaving = false,
  saved = false,
  error = null,
  disabled = false,
}: Props) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-white/8 bg-bg-main/95 px-4 py-3 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-2">
        {saved ? (
          <span className="flex items-center gap-1.5 text-sm text-text-sec">
            <Check className="h-4 w-4 text-green-400" />
            {UI_TEXT.common.saved}
          </span>
        ) : null}
        {error ? <span className="text-sm text-red-400">{error}</span> : null}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || isSaving}
        className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {isSaving ? UI_TEXT.common.saving : UI_TEXT.common.saveChanges}
      </button>
        </div>
  );
}

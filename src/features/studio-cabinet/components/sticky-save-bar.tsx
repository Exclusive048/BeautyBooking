"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="sticky bottom-3 z-10">
      <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle/80 bg-bg-card/95 px-4 py-3 shadow-card backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex items-center gap-2">
          {saved ? (
            <span className="flex items-center gap-1.5 text-sm text-text-sec">
              <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              {UI_TEXT.common.saved}
            </span>
          ) : null}
          {error ? <span className="truncate text-sm text-red-600 dark:text-red-400">{error}</span> : null}
        </div>
        <Button onClick={onSave} size="md" disabled={disabled || isSaving} className="w-full md:w-auto">
          {isSaving ? UI_TEXT.common.saving : UI_TEXT.actions.save}
        </Button>
      </div>
    </div>
  );
}

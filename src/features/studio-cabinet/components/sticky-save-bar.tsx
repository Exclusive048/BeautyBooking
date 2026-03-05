"use client";

import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  onSave: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function StickySaveBar({ onSave, loading = false, disabled = false }: Props) {
  return (
    <div className="sticky bottom-4 z-10">
      <div className="glass-panel rounded-[22px] p-3">
        <div className="flex items-center justify-end">
          <Button type="button" onClick={onSave} disabled={disabled || loading}>
            {loading ? UI_TEXT.status.savingInProgress : UI_TEXT.actions.saveChanges}
          </Button>
        </div>
      </div>
    </div>
  );
}

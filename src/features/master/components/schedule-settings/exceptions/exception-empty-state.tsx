"use client";

import { CalendarX, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.exceptions;

type Props = {
  onAdd: () => void;
};

/**
 * Empty state for the Exceptions tab. Shown when there are no overrides
 * for the provider yet. Mirrors the placeholder-tab vocabulary so the
 * "nothing here" + CTA grammar is consistent across the cabinet.
 */
export function ExceptionEmptyState({ onAdd }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <CalendarX className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden />
      <p className="mb-1 font-display text-base text-text-main">{T.emptyTitle}</p>
      <p className="mb-4 max-w-xs text-sm text-text-sec">{T.emptyBody}</p>
      <Button type="button" variant="secondary" size="md" className="rounded-xl" onClick={onAdd}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        {T.emptyCta}
      </Button>
    </div>
  );
}

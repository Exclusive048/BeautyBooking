import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.publicProfile.bookingWidget;

type Props = {
  onRetry: () => void;
};

/**
 * Phase 4 — friendly "someone took your slot" recovery. Keeps the
 * widget rendered (so the user doesn't lose context) and sends them
 * back to selection with the slot list refreshed (the reducer clears
 * `selectedSlot` on transition, the TimeGrid refetches on mount).
 */
export function ConflictPhase({ onRetry }: Props) {
  return (
    <div className="p-5 text-center">
      <AlertCircle
        className="mx-auto mb-3 h-10 w-10 text-amber-500"
        aria-hidden
        strokeWidth={1.6}
      />
      <p className="mb-1 font-display text-base text-text-main">{T.conflictHeading}</p>
      <p className="mx-auto mb-5 max-w-xs text-sm leading-relaxed text-text-sec">
        {T.conflictBody}
      </p>
      <Button size="lg" onClick={onRetry} className="gap-1.5">
        <RotateCcw className="h-4 w-4" aria-hidden strokeWidth={1.8} />
        {T.conflictRetry}
      </Button>
    </div>
  );
}

import { Users } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.detail;

/**
 * Right-pane placeholder when no `?id=` is selected. Desktop-only — on
 * mobile the detail pane simply isn't rendered until a row is tapped.
 */
export function EmptyDetailState() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-bg-card px-4 py-16 text-center">
      <Users className="mb-3 h-10 w-10 text-text-sec/40" aria-hidden />
      <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
      <p className="mt-1 max-w-xs text-sm text-text-sec">{T.emptyBody}</p>
    </div>
  );
}

import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.detail;

/**
 * Right-pane placeholder when no `?id=` is selected. Desktop-only — on
 * mobile the detail pane simply isn't rendered until a row is tapped.
 * `className="h-full"` preserves the full-pane fill — distinct from the
 * default block-sized empty state used elsewhere.
 */
export function EmptyDetailState() {
  return (
    <EmptyState
      variant="card"
      icon={Users}
      title={T.emptyTitle}
      description={T.emptyBody}
      className="h-full"
    />
  );
}

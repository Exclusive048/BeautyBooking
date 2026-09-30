import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminCategoryStatus } from "@/features/admin-cabinet/catalog/types";

const LABEL: Record<AdminCategoryStatus, string> = {
  PENDING: UI_TEXT.adminPanel.catalog.status.pending,
  APPROVED: UI_TEXT.adminPanel.catalog.status.approved,
  REJECTED: UI_TEXT.adminPanel.catalog.status.rejected,
};

const TONE_CLASS: Record<AdminCategoryStatus, string> = {
  // Status-tone Tailwind built-ins, mirrored from the master-cabinet
  // booking-status palette so the two cabinets share one mental model.
  PENDING:
    "bg-warning/[0.12] text-warning-text ring-warning/30",
  APPROVED:
    "bg-success/[0.12] text-success-text ring-success/30",
  REJECTED:
    "bg-destructive/[0.12] text-danger-text ring-destructive/30",
};

type Props = {
  status: AdminCategoryStatus;
  className?: string;
};

export function CatalogStatusPill({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASS[status],
        className,
      )}
    >
      {LABEL[status]}
    </span>
  );
}

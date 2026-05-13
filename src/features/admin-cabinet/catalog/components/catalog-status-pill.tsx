import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
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
    "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  APPROVED:
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  REJECTED:
    "bg-red-500/12 text-red-700 dark:text-red-300 ring-red-500/30",
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

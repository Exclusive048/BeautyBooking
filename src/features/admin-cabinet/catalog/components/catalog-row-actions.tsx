"use client";

import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminCategoryStatus } from "@/features/admin-cabinet/catalog/types";

const T = UI_TEXT.adminPanel.catalog.rowActions;

type Props = {
  status: AdminCategoryStatus;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
};

/** Tight 28×28 icon-button cluster aligned to the right edge of each
 * row. Approve/reject are conditional on status: only PENDING rows
 * can be approved, only PENDING and APPROVED can be rejected. Edit
 * is always available. */
export function CatalogRowActions({
  status,
  busy,
  onApprove,
  onReject,
  onEdit,
}: Props) {
  const canApprove = status === "PENDING";
  const canReject = status !== "REJECTED";

  return (
    <div className="inline-flex items-center gap-1">
      {canApprove ? (
        <IconButton
          label={T.approve}
          onClick={onApprove}
          disabled={busy}
          tone="success"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
        </IconButton>
      ) : null}
      {canReject ? (
        <IconButton
          label={T.reject}
          onClick={onReject}
          disabled={busy}
          tone="danger"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </IconButton>
      ) : null}
      <IconButton label={T.edit} onClick={onEdit} disabled={busy} tone="neutral">
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </IconButton>
    </div>
  );
}

type IconButtonTone = "success" | "danger" | "neutral";

function IconButton({
  children,
  label,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: IconButtonTone;
}) {
  const toneClass: Record<IconButtonTone, string> = {
    success:
      "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
    danger:
      "bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300",
    neutral:
      "bg-bg-input text-text-sec hover:bg-bg-input/80 hover:text-text-main",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-50",
        toneClass[tone],
      )}
    >
      {children}
    </button>
  );
}

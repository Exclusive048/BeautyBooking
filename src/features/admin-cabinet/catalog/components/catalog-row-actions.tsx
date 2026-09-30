"use client";

import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminCategoryStatus } from "@/features/admin-cabinet/catalog/types";
import { Button } from "@/components/ui/button";

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
      "bg-success/10 text-success-text hover:bg-success/20",
    danger:
      "bg-destructive/10 text-danger-text hover:bg-destructive/20",
    neutral:
      "bg-bg-input text-text-sec hover:bg-bg-input/80 hover:text-text-main",
  };

  return (
    <Button
      variant="wrapper"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors", toneClass[tone])}
    >
      {children}
    </Button>
  );
}

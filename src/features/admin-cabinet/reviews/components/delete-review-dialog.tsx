"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminReviewRow } from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews.deleteDialog;

type Props = {
  open: boolean;
  review: AdminReviewRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

/** Delete confirm with optional admin reason for the log. Body
 * shows the author so admins can sanity-check they're deleting
 * the right row. Warning callout reminds that the row is **hard
 * deleted** (no soft delete column yet — see BACKLOG 🔴). */
export function DeleteReviewDialog({
  open,
  review,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reset the form when the dialog re-opens for a different review.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason("");
  }, [open]);

  if (!review) return null;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      submitVariant="danger"
      onSubmit={() => onConfirm(reason.trim())}
    >
      <p className="text-sm text-text-main">
        {T.body.replace("{author}", review.authorDisplay)}
      </p>
      <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2.5">
        <AlertTriangle
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-300"
          aria-hidden
        />
        <p className="text-xs text-red-700 dark:text-red-300">{T.warning}</p>
      </div>
      <div>
        <label
          htmlFor="delete-review-reason"
          className="mb-1.5 block text-xs font-medium text-text-sec"
        >
          {T.reasonLabel}
        </label>
        <Textarea
          id="delete-review-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={T.reasonPlaceholder}
          rows={3}
          maxLength={500}
        />
      </div>
    </FormDialog>
  );
}

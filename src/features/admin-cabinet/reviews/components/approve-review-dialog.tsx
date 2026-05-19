"use client";

import { FormDialog } from "@/components/ui/form-dialog";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.reviews.approveDialog;

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

/** Minimal confirm — approve has no admin reason field because it's
 * the "this report was wrong" decision; no extra context needed. */
export function ApproveReviewDialog({ open, onClose, onConfirm }: Props) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      onSubmit={onConfirm}
    >
      <p className="text-sm text-text-main">{T.body}</p>
    </FormDialog>
  );
}

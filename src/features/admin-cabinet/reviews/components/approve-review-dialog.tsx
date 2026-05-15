"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
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
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-main">{T.body}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={submitting}>
            {T.confirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

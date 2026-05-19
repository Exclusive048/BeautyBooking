"use client";

import { useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  onClose: () => void;
  requestId: string;
  providerName: string;
  onResolved: () => void;
};

const T = UI_TEXT.studioCabinet.scheduleRequests.rejectDialog;
const E = UI_TEXT.studioCabinet.scheduleRequests.errors;

export function RejectDialog({ open, onClose, requestId, providerName, onResolved }: Props) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setComment("");
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    const trimmed = comment.trim();
    if (!trimmed) {
      setError(E.commentRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio/schedule/requests/${requestId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? E.rejectFailed);
        return;
      }
      onResolved();
      reset();
      onClose();
    } catch {
      setError(E.rejectFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      submitVariant="danger"
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">
        {T.body.replace("{provider}", providerName)}
      </p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-text-main">
          {T.commentLabel}
        </span>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={T.commentPlaceholder}
          disabled={submitting}
          maxLength={500}
        />
      </label>
    </FormDialog>
  );
}

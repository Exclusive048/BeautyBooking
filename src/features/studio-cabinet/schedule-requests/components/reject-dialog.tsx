"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
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
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
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

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="danger" onClick={handleSubmit} disabled={submitting}>
            {submitting ? T.submitting : T.confirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

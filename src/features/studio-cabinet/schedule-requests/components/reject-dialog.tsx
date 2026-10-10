"use client";

import { useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-label";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { SCHEDULE_REQUEST_REJECT_COMMENT_MAX } from "../lib/reject-comment";

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
      // FIX-C8: второй (и последний) сайт, читавший `error` конверта как
      // строку — разбор в `approve-dialog.tsx`. Объект уезжал в проп
      // `error?: string | null` и ронял диалог при любом отказе.
      await fetchJson(`/api/studio/schedule/requests/${requestId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: trimmed }),
      });
      onResolved();
      reset();
      onClose();
    } catch (caught) {
      setError(serverMessageOr(caught, E.rejectFailed));
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
        <FieldLabel className="text-sm">
          {T.commentLabel}
        </FieldLabel>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={T.commentPlaceholder}
          disabled={submitting}
          maxLength={SCHEDULE_REQUEST_REJECT_COMMENT_MAX}
        />
      </label>
    </FormDialog>
  );
}

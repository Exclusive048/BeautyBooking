"use client";

import { useCallback, useId, useState } from "react";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ui/form-dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

type ReportReason = "SPAM" | "FAKE" | "OFFENSIVE" | "INAPPROPRIATE" | "OTHER";

type Props = {
  reviewId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: UI_TEXT.reviews.reportReasonSpam },
  { value: "FAKE", label: UI_TEXT.reviews.reportReasonFake },
  { value: "OFFENSIVE", label: UI_TEXT.reviews.reportReasonOffensive },
  { value: "INAPPROPRIATE", label: UI_TEXT.reviews.reportReasonInappropriate },
  { value: "OTHER", label: UI_TEXT.reviews.reportReasonOther },
];

export function ReportReviewModal({ reviewId, open, onClose, onSuccess }: Props) {
  const reasonId = useId();
  const commentId = useId();
  const t = UI_TEXT.reviews;
  const [reason, setReason] = useState<ReportReason | "">("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setReason("");
    setComment("");
    setError(null);
    onClose();
  }, [submitting, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson<unknown>(`/api/reviews/${encodeURIComponent(reviewId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, comment: comment.trim() || undefined }),
      });
      onSuccess();
      handleClose();
    } catch (err) {
      // «Вы уже пожаловались», лимит — дословно.
      setError(serverMessageOr(err, t.reportFailed));
    } finally {
      setSubmitting(false);
    }
  }, [reviewId, reason, comment, t.reportFailed, onSuccess, handleClose]);

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={t.reportModalTitle}
      submitLabel={t.reportSubmit}
      cancelLabel={UI_TEXT.actions.cancel}
      onSubmit={handleSubmit}
      error={error}
      submitDisabled={!reason}
    >
      <p className="text-sm text-text-sec">{t.reportModalDesc}</p>

      <div>
        <FieldLabel htmlFor={reasonId} tone="muted">{t.reportReasonLabel}</FieldLabel>
        <Select
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason | "")}
          className="w-full"
        >
          <option value="" disabled>{t.reportReasonPlaceholder}</option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
      </div>

      <div>
        <FieldLabel htmlFor={commentId} tone="muted">{t.reportCommentLabel}</FieldLabel>
        <Textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t.reportCommentPlaceholder}
          maxLength={500}
          rows={3}
        />
        <div className="mt-1 text-right text-xs text-text-sec">{comment.length}/500</div>
      </div>
    </FormDialog>
  );
}

"use client";

import { useCallback, useState } from "react";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ui/form-dialog";
import { UI_TEXT } from "@/lib/ui/text";

type ReportReason = "SPAM" | "FAKE" | "OFFENSIVE" | "INAPPROPRIATE" | "OTHER";

type Props = {
  reviewId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: UI_TEXT.master.reviews.reportReasonSpam },
  { value: "FAKE", label: UI_TEXT.master.reviews.reportReasonFake },
  { value: "OFFENSIVE", label: UI_TEXT.master.reviews.reportReasonOffensive },
  { value: "INAPPROPRIATE", label: UI_TEXT.master.reviews.reportReasonInappropriate },
  { value: "OTHER", label: UI_TEXT.master.reviews.reportReasonOther },
];

export function ReportReviewModal({ reviewId, open, onClose, onSuccess }: Props) {
  const t = UI_TEXT.master.reviews;
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
      const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, comment: comment.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok && json.error ? json.error.message : t.reportFailed);
      }
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.reportFailed);
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
        <label className="mb-1.5 block text-xs font-medium text-text-sec">{t.reportReasonLabel}</label>
        <Select
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
        <label className="mb-1.5 block text-xs font-medium text-text-sec">{t.reportCommentLabel}</label>
        <Textarea
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

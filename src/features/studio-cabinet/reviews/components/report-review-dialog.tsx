"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-label";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.reviewsV2.reportDialog;
const E = UI_TEXT.studioCabinet.reviewsV2.toasts;

type Props = {
  reviewId: string | null;
  onClose: () => void;
};

const REASONS = [
  { value: "SPAM", label: "Спам" },
  { value: "FAKE", label: "Ненастоящий отзыв" },
  { value: "OFFENSIVE", label: "Оскорбления" },
  { value: "INAPPROPRIATE", label: "Неуместный" },
  { value: "OTHER", label: "Другое" },
] as const;

/**
 * Studio admin / master reports a review to the platform admin via the
 * existing `/api/reviews/[id]/report` endpoint. One report per review is
 * enforced server-side (409 on retry). No new schema — Review carries
 * `reportReason` + `reportComment` + `reportedAt` denormalised fields.
 */
export function ReportReviewDialog({ reviewId, onClose }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("SPAM");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason("SPAM");
    setComment("");
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reviewId) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/reviews/${encodeURIComponent(reviewId)}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason,
          comment: comment.trim() || undefined,
        }),
      });
      reset();
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={Boolean(reviewId)}
      onClose={handleClose}
      title={T.title}
      submitLabel={T.submit}
      cancelLabel={T.cancel}
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">{T.subtitle}</p>
      <label className="block">
        <FieldLabel>{T.reasonLabel}</FieldLabel>
        <Select
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
          disabled={submitting}
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <FieldLabel>{T.commentLabel}</FieldLabel>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={T.commentPlaceholder}
          rows={3}
          disabled={submitting}
          maxLength={500}
        />
      </label>
    </FormDialog>
  );
}

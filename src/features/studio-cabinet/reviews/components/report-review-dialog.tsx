"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.reviewsV2.reportDialog;
const E = UI_TEXT.studioCabinet.reviewsV2.toasts;

type Props = {
  reviewId: string | null;
  onClose: () => void;
};

const REASONS = [
  { value: "SPAM", label: "Спам" },
  { value: "FAKE", label: "Фейк" },
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
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason,
          comment: comment.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.error);
        return;
      }
      reset();
      onClose();
      router.refresh();
    } catch {
      setError(E.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={Boolean(reviewId)} onClose={handleClose} title={T.title}>
      <div className="space-y-3">
        <p className="text-sm text-text-sec">{T.subtitle}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">{T.reasonLabel}</span>
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
          <span className="mb-1 block text-xs font-medium text-text-main">{T.commentLabel}</span>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={T.commentPlaceholder}
            rows={3}
            disabled={submitting}
            maxLength={500}
          />
        </label>
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

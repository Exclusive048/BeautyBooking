"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
import type { ClientReviewItem } from "@/lib/client-cabinet/reviews.service";

const T = UI_TEXT.clientCabinet.reviews;
const FORM_T = UI_TEXT.clientCabinet.reviewForm;

type Props = {
  review: ClientReviewItem;
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * Edit a client's own review within the 48h window. Backend enforces the
 * window too (returns `EDIT_WINDOW_EXPIRED`) so this modal is a UX
 * convenience — opening it stale is harmless, submit will be rejected
 * and we surface the message.
 */
export function EditReviewModal({ review, onClose, onSuccess }: Props) {
  const [rating, setRating] = useState(review.rating);
  const [text, setText] = useState(review.text ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    rating >= 1 && rating <= 5 && !submitting &&
    (rating !== review.rating || text.trim() !== (review.text ?? "").trim());

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          text: text.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const code = json?.error?.code;
        if (code === "EDIT_WINDOW_EXPIRED") {
          setError(T.editWindowHint);
        } else {
          setError(json?.error?.message ?? FORM_T.submitFailed);
        }
        return;
      }
      onSuccess();
    } catch {
      setError(FORM_T.submitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={T.editAction}
      submitLabel={UI_TEXT.clientCabinet.common.save}
      cancelLabel={FORM_T.cancel}
      onSubmit={handleSubmit}
      error={error}
      submitDisabled={!canSubmit}
    >
      <div className="rounded-xl bg-bg-input/50 p-3 text-sm">
        <div className="font-semibold text-text-main">{review.target.name}</div>
        {review.serviceName ? (
          <div className="mt-0.5 text-text-sec">{review.serviceName}</div>
        ) : null}
      </div>

      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          Оценка
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className="p-1"
              aria-label={`${n}`}
            >
              <Star
                className={`h-7 w-7 transition ${
                  n <= rating ? "fill-primary text-primary" : "text-text-sec/40"
                }`}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="edit-review-text"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
        >
          Текст отзыва
        </label>
        <Textarea
          id="edit-review-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={FORM_T.textPlaceholder}
          rows={4}
          maxLength={1000}
        />
        <div className="text-right font-mono text-xs text-text-sec">
          {text.length}/1000
        </div>
      </div>
    </FormDialog>
  );
}

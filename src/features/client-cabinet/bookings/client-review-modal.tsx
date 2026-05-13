"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
import type { ClientBookingDTO } from "@/lib/client-cabinet/bookings.service";

const T = UI_TEXT.clientCabinet.reviewForm;
const PAGE_T = UI_TEXT.clientCabinet.bookingsPage;

type Props = {
  booking: ClientBookingDTO;
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * Lightweight review modal. Photo upload is deferred — the existing review
 * endpoint accepts text + rating + tags; tags UI / media upload lives in
 * the larger review-form (`src/features/reviews/...`) used inside the
 * booking detail drawer. This modal keeps the surface compact so the user
 * can drop a 5★ in seconds from the bookings list.
 */
export function ClientReviewModal({ booking, onClose, onSuccess }: Props) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          rating,
          text: text.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? T.submitFailed);
        return;
      }
      onSuccess();
    } catch {
      setError(T.submitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = rating > 0 && !submitting;

  return (
    <ModalSurface open onClose={onClose} title={T.title}>
      <div className="space-y-4">
        <div className="rounded-xl bg-bg-input/50 p-3 text-sm">
          <div className="font-semibold text-text-main">
            {booking.service.name}
          </div>
          <div className="mt-0.5 text-text-sec">{booking.provider.name}</div>
        </div>

        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {PAGE_T.actionReview}
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
                    n <= rating
                      ? "fill-primary text-primary"
                      : "text-text-sec/40"
                  }`}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="review-text"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
          >
            {T.title}
          </label>
          <Textarea
            id="review-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={T.textPlaceholder}
            rows={4}
            maxLength={1000}
          />
          <div className="text-right font-mono text-xs text-text-sec">
            {text.length}/1000
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-300/50 bg-rose-50/60 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? T.sending : T.submit}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

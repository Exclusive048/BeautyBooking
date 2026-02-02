"use client";

import { useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import type { ReviewDto } from "@/lib/reviews/types";

type Props = {
  bookingId: string;
  onSubmitted: (review: ReviewDto) => void;
  onCancel?: () => void;
};

function starsLabel(rating: number): string {
  return "*".repeat(rating) + "-".repeat(Math.max(0, 5 - rating));
}

export function ReviewForm({ bookingId, onSubmitted, onCancel }: Props) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          rating,
          text: text.trim() ? text.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ review: ReviewDto }> | null;
      if (!res.ok || !json || !json.ok) {
        const message = json && !json.ok ? json.error.message : `API error: ${res.status}`;
        throw new Error(message);
      }
      onSubmitted(json.data.review);
      setText("");
      setRating(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-semibold">Leave review</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            className={`rounded-lg border px-3 py-1 text-sm ${
              rating === value ? "bg-black text-white border-black" : "border-neutral-300"
            }`}
            disabled={loading}
          >
            {starsLabel(value)}
          </button>
        ))}
      </div>

      <textarea
        className="mt-3 w-full rounded-xl border px-3 py-2 text-sm min-h-[100px]"
        placeholder="Comment (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        disabled={loading}
      />

      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="rounded-lg bg-black text-white px-3 py-2 text-sm disabled:opacity-60"
        >
          {loading ? "Sending..." : "Submit"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import type { ReviewDto, ReviewTagDto } from "@/lib/reviews/types";

// AUDIT (section 3):
// - UI now supports PUBLIC and PRIVATE tag selection with max-3 per group.
type Props = {
  bookingId: string;
  onSubmitted: (review: ReviewDto) => void;
  onCancel?: () => void;
};

type ReviewTagsResponse = {
  publicTags: ReviewTagDto[];
  privateTags: ReviewTagDto[];
};

const MAX_TAGS_PER_GROUP = 3;

function starsLabel(rating: number): string {
  return "*".repeat(rating) + "-".repeat(Math.max(0, 5 - rating));
}

function ChipButton(props: {
  tag: ReviewTagDto;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { tag, selected, disabled, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
        selected ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-neutral-700"
      }`}
    >
      {tag.icon ? `${tag.icon} ` : ""}
      {tag.label}
    </button>
  );
}

export function ReviewForm({ bookingId, onSubmitted, onCancel }: Props) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [publicTags, setPublicTags] = useState<ReviewTagDto[]>([]);
  const [privateTags, setPrivateTags] = useState<ReviewTagDto[]>([]);
  const [selectedPublicTagIds, setSelectedPublicTagIds] = useState<string[]>([]);
  const [selectedPrivateTagIds, setSelectedPrivateTagIds] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setTagsLoading(true);
        setTagsError(null);
        const res = await fetch("/api/reviews/tags", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<ReviewTagsResponse> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        if (cancelled) return;
        setPublicTags(json.data.publicTags);
        setPrivateTags(json.data.privateTags);
      } catch (loadError) {
        if (cancelled) return;
        setTagsError(loadError instanceof Error ? loadError.message : "Failed to load tags");
      } finally {
        if (!cancelled) {
          setTagsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = useMemo(() => !loading && rating >= 1 && rating <= 5, [loading, rating]);

  const toggleSelection = (
    tagId: string,
    selected: string[],
    setSelected: (value: string[]) => void,
    limitMessage: string
  ) => {
    if (selected.includes(tagId)) {
      setHint(null);
      setSelected(selected.filter((id) => id !== tagId));
      return;
    }
    if (selected.length >= MAX_TAGS_PER_GROUP) {
      setHint(limitMessage);
      return;
    }
    setHint(null);
    setSelected([...selected, tagId]);
  };

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
          publicTagIds: selectedPublicTagIds,
          privateTagIds: selectedPrivateTagIds,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ review: ReviewDto }> | null;
      if (!res.ok || !json || !json.ok) {
        const fieldErrors = json && !json.ok ? json.error.fieldErrors : undefined;
        const fieldMessage =
          fieldErrors && typeof fieldErrors === "object"
            ? Object.values(fieldErrors)
                .map((value) => (Array.isArray(value) ? value.join(", ") : String(value)))
                .find((value) => value.trim().length > 0)
            : undefined;
        const message =
          fieldMessage || (json && !json.ok ? json.error.message : `API error: ${res.status}`);
        throw new Error(message);
      }
      onSubmitted(json.data.review);
      setText("");
      setRating(5);
      setSelectedPublicTagIds([]);
      setSelectedPrivateTagIds([]);
      setHint(null);
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

      <div className="mt-4">
        <div className="text-xs font-medium text-neutral-700">What did you like most? (up to 3)</div>
        {tagsLoading ? <div className="mt-2 text-xs text-neutral-500">Loading tags...</div> : null}
        {tagsError ? <div className="mt-2 text-xs text-red-600">{tagsError}</div> : null}
        {!tagsLoading && !tagsError ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {publicTags.map((tag) => (
              <ChipButton
                key={tag.id}
                tag={tag}
                selected={selectedPublicTagIds.includes(tag.id)}
                disabled={loading}
                onClick={() =>
                  toggleSelection(
                    tag.id,
                    selectedPublicTagIds,
                    setSelectedPublicTagIds,
                    `You can select up to ${MAX_TAGS_PER_GROUP}`
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      <textarea
        className="mt-3 w-full rounded-xl border px-3 py-2 text-sm min-h-[100px]"
        placeholder="Расскажи как прошло — это поможет другим клиентам"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        disabled={loading}
      />

      <div className="mt-4">
        <div className="text-xs font-medium text-neutral-700">What can be improved? (up to 3)</div>
        <div className="mt-1 text-[11px] text-neutral-500">These marks are visible only to the master</div>
        {tagsLoading ? <div className="mt-2 text-xs text-neutral-500">Loading tags...</div> : null}
        {!tagsLoading && !tagsError ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {privateTags.map((tag) => (
              <ChipButton
                key={tag.id}
                tag={tag}
                selected={selectedPrivateTagIds.includes(tag.id)}
                disabled={loading}
                onClick={() =>
                  toggleSelection(
                    tag.id,
                    selectedPrivateTagIds,
                    setSelectedPrivateTagIds,
                    `You can select up to ${MAX_TAGS_PER_GROUP}`
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      {hint ? <div className="mt-2 text-xs text-amber-700">{hint}</div> : null}
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
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

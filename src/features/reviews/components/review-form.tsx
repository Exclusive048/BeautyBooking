"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import type { ReviewDto, ReviewTagDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";

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

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const effective = hovered || value;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !disabled && onChange(star)}
          onMouseEnter={() => !disabled && setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          disabled={disabled}
          aria-label={`${star} звезд`}
          className="p-1 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Star
            className={cn(
              "h-8 w-8 transition-colors",
              star <= effective
                ? "fill-amber-400 stroke-amber-400"
                : "fill-none stroke-text-sec/30"
            )}
          />
        </button>
      ))}
    </div>
  );
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
      className={cn(
        "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border-subtle bg-bg-input text-text-sec hover:border-border hover:text-text-main"
      )}
    >
      {tag.icon ? <span>{tag.icon}</span> : null}
      {tag.label}
    </button>
  );
}

export function ReviewForm({ bookingId, onSubmitted, onCancel }: Props) {
  const t = UI_TEXT.clientCabinet.reviewForm;
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
    void (async () => {
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
        setTagsError(loadError instanceof Error ? loadError.message : t.loadTagsFailed);
      } finally {
        if (!cancelled) setTagsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t.loadTagsFailed]);

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
                .map((v) => (Array.isArray(v) ? v.join(", ") : String(v)))
                .find((v) => v.trim().length > 0)
            : undefined;
        throw new Error(
          fieldMessage || (json && !json.ok ? json.error.message : `API error: ${res.status}`)
        );
      }
      onSubmitted(json.data.review);
      setText("");
      setRating(5);
      setSelectedPublicTagIds([]);
      setSelectedPrivateTagIds([]);
      setHint(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.submitFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="text-sm font-semibold text-text-main">{t.title}</div>

      {/* Star rating */}
      <div className="mt-3">
        <StarRating value={rating} onChange={setRating} disabled={loading} />
      </div>

      {/* Public tags */}
      <div className="mt-4">
        <div className="text-xs font-medium text-text-main">{t.publicTagsTitle}</div>
        {tagsLoading ? (
          <div className="mt-2 text-xs text-text-sec">{t.tagsLoading}</div>
        ) : tagsError ? (
          <div className="mt-2 text-xs text-red-600">{tagsError}</div>
        ) : publicTags.length > 0 ? (
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
                    t.tagsLimit.replace("{count}", String(MAX_TAGS_PER_GROUP))
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Text */}
      <div className="mt-4">
        <Textarea
          className="min-h-[100px]"
          placeholder={t.textPlaceholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          disabled={loading}
        />
        <p className="mt-1 text-right text-xs text-text-sec">{text.length}/1000</p>
      </div>

      {/* Private tags */}
      {privateTags.length > 0 ? (
        <div className="mt-4">
          <div className="text-xs font-medium text-text-main">{t.privateTagsTitle}</div>
          <div className="mt-0.5 text-[11px] text-text-sec">{t.privateTagsHint}</div>
          {!tagsLoading ? (
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
                      t.tagsLimit.replace("{count}", String(MAX_TAGS_PER_GROUP))
                    )
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {hint ? <div className="mt-2 text-xs text-amber-500">{hint}</div> : null}
      {error ? <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={submit} disabled={!canSubmit}>
          {loading ? t.sending : t.submit}
        </Button>
        {onCancel ? (
          <Button type="button" onClick={onCancel} disabled={loading} variant="secondary">
            {t.cancel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

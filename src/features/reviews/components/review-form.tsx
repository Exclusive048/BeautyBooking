"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
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
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      size="sm"
      variant={selected ? "primary" : "secondary"}
      className={`rounded-full px-3 text-xs ${
        selected ? "" : "border-border-subtle bg-bg-input text-text-main hover:bg-bg-elevated"
      }`}
    >
      {tag.icon ? `${tag.icon} ` : ""}
      {tag.label}
    </Button>
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
        if (!cancelled) {
          setTagsLoading(false);
        }
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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.submitFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="text-sm font-semibold text-text-main">{t.title}</div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            size="sm"
            variant={rating === value ? "primary" : "secondary"}
            className="h-8 rounded-lg px-3 text-sm"
            disabled={loading}
          >
            {starsLabel(value)}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-text-main">{t.publicTagsTitle}</div>
        {tagsLoading ? <div className="mt-2 text-xs text-text-sec">{t.tagsLoading}</div> : null}
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
                    t.tagsLimit.replace("{count}", String(MAX_TAGS_PER_GROUP))
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      <Textarea
        className="mt-3 min-h-[100px]"
        placeholder={t.textPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={1000}
        disabled={loading}
      />

      <div className="mt-4">
        <div className="text-xs font-medium text-text-main">{t.privateTagsTitle}</div>
        <div className="mt-1 text-[11px] text-text-sec">{t.privateTagsHint}</div>
        {tagsLoading ? <div className="mt-2 text-xs text-text-sec">{t.tagsLoading}</div> : null}
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
                    t.tagsLimit.replace("{count}", String(MAX_TAGS_PER_GROUP))
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      {hint ? <div className="mt-2 text-xs text-amber-300">{hint}</div> : null}
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

      <div className="mt-3 flex gap-2">
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import * as UI_TEXT from "@/lib/ui/text";
import type { ReviewDto, ReviewTagDto } from "@/lib/reviews/types";
import { ApiClientError, fetchJson, serverMessageOr } from "@/lib/http/client";
import { ChipButton } from "@/components/ui/chip-button";
import { StarRatingInput } from "@/components/ui/star-rating-input";

type Props = {
  bookingId: string;
  onSubmitted: (review: ReviewDto) => void;
  onCancel?: () => void;
  /**
   * Куда отправлять отзыв. По умолчанию — `/api/reviews` (клиент с сессией);
   * гость по ссылке «Управлять записью» — `/api/public/bookings/manage/{token}/review`
   * (29.09 доработки · 05). Тело то же (`createReviewSchema`).
   */
  submitUrl?: string;
};

type ReviewTagsResponse = {
  publicTags: ReviewTagDto[];
  privateTags: ReviewTagDto[];
};

const MAX_TAGS_PER_GROUP = 3;

function TagChip(props: {
  tag: ReviewTagDto;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { tag, selected, disabled, onClick } = props;
  return (
    <ChipButton active={selected} onClick={onClick} disabled={disabled} className="gap-1">
      {tag.icon ? <span>{tag.icon}</span> : null}
      {tag.label}
    </ChipButton>
  );
}

export function ReviewForm({ bookingId, onSubmitted, onCancel, submitUrl = "/api/reviews" }: Props) {
  const t = UI_TEXT.reviews.form;
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
        // Форма живёт и у гостя (ссылка «Управлять записью»): без ухода на вход.
        const tags = await fetchJson<ReviewTagsResponse>("/api/reviews/tags", { cache: "no-store" });
        if (cancelled) return;
        setPublicTags(tags.publicTags);
        setPrivateTags(tags.privateTags);
      } catch (loadError) {
        if (cancelled) return;
        setTagsError(serverMessageOr(loadError, t.loadTagsFailed));
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
      const created = await fetchJson<{ review: ReviewDto }>(submitUrl, {
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
      onSubmitted(created.review);
      setText("");
      setRating(5);
      setSelectedPublicTagIds([]);
      setSelectedPrivateTagIds([]);
      setHint(null);
    } catch (submitError) {
      // Ошибка поля точнее общего отказа проверки — показываем её первой.
      const fieldErrors = submitError instanceof ApiClientError ? submitError.fieldErrors : undefined;
      const fieldMessage = fieldErrors
        ? Object.values(fieldErrors)
            .map((v) => (Array.isArray(v) ? v.join(", ") : String(v)))
            .find((v) => v.trim().length > 0)
        : undefined;
      setError(fieldMessage || serverMessageOr(submitError, t.submitFailed));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="text-sm font-semibold text-text-main">{t.title}</div>

      {/* Star rating */}
      <div className="mt-3">
        <StarRatingInput value={rating} onChange={setRating} disabled={loading} size="lg" />
      </div>

      {/* Public tags */}
      <div className="mt-4">
        <div className="text-xs font-medium text-text-main">{t.publicTagsTitle}</div>
        {tagsLoading ? (
          <div className="mt-2 text-xs text-text-sec">{t.tagsLoading}</div>
        ) : tagsError ? (
          <div className="mt-2 text-xs text-danger-text">{tagsError}</div>
        ) : publicTags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {publicTags.map((tag) => (
              <TagChip
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
          <div className="mt-0.5 text-2xs text-text-sec">{t.privateTagsHint}</div>
          {!tagsLoading ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {privateTags.map((tag) => (
                <TagChip
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

      {hint ? <div className="mt-2 text-xs text-warning-text">{hint}</div> : null}
      {error ? <div className="mt-2 text-sm text-danger-text">{error}</div> : null}

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

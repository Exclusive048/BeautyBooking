"use client";

import { useState } from "react";
import { Flag, MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { initialsOf } from "../lib/format";
import type { StudioReviewItem } from "../lib/types";
import { RatingStars } from "./rating-stars";
import { ReviewReplyForm } from "./review-reply-form";

const T = UI_TEXT.studioCabinet.reviewsV2;

type Props = {
  review: StudioReviewItem;
  onReport: (reviewId: string) => void;
};

/**
 * Per-row review card. Renders avatar + rating + date, the service ·
 * master attribution line, the review text, an existing reply block
 * (always labelled «Ответ студии» — no master attribution per spec) or
 * a Reply CTA when the user has `canReply`. Report flag opens the
 * report dialog (handled at the list level via `onReport`).
 *
 * Per spec: no bookmark icon, no toggle for «от лица студии/мастера»,
 * no delete/hide affordance (reviews are immutable from the studio
 * surface — moderation runs through the admin via Report).
 */
export function ReviewCard({ review, onReport }: Props) {
  const [showReplyForm, setShowReplyForm] = useState(false);

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-input text-sm font-semibold text-text-sec ring-1 ring-border-subtle"
        >
          {initialsOf(review.clientName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-text-main">{review.clientName}</span>
            <RatingStars value={review.rating} size="sm" />
            <span className="text-xs text-text-sec">{review.dateLabel}</span>
            {review.isReported ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                {T.card.reportedBadge}
              </span>
            ) : null}
          </div>
          {(review.master || review.serviceName) ? (
            <p className="mt-0.5 truncate text-xs text-text-sec">
              {[review.master?.displayName, review.serviceName].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {review.canReply && !review.reply ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReplyForm((v) => !v)}
              className="gap-1"
            >
              <MessageSquareReply className="h-3.5 w-3.5" aria-hidden />
              {T.actions.reply}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => onReport(review.id)}
            disabled={review.isReported}
            className={cn(
              "inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors",
              review.isReported
                ? "cursor-not-allowed opacity-40"
                : "hover:bg-bg-input hover:text-text-main",
            )}
            aria-label={T.actions.report}
            title={review.isReported ? T.card.reportedBadge : T.actions.report}
          >
            <Flag className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {review.text ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-text-main">{review.text}</p>
      ) : null}

      {review.reply ? (
        <div className="mt-3 rounded-xl border-l-2 border-primary/40 bg-bg-input/40 px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-text">
            {T.card.replyCaption}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-main">{review.reply.text}</p>
        </div>
      ) : null}

      {showReplyForm && review.canReply && !review.reply ? (
        <ReviewReplyForm
          reviewId={review.id}
          onCancel={() => setShowReplyForm(false)}
        />
      ) : null}
    </article>
  );
}

"use client";

import { ReviewTargetType } from "@prisma/client";
import { AlertTriangle, Flag } from "lucide-react";
import { ReviewActions } from "@/features/admin-cabinet/reviews/components/review-actions";
import { ReviewRatingStars } from "@/features/admin-cabinet/reviews/components/review-rating-stars";
import { ReviewReportInfo } from "@/features/admin-cabinet/reviews/components/review-report-info";
import { UserAvatar } from "@/features/admin-cabinet/users/components/user-avatar";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminReviewRow } from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews.card;

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

type Props = {
  review: AdminReviewRow;
  busy: boolean;
  onApprove: () => void;
  onDelete: () => void;
};

/** Single review card. 3-column grid on lg+ (main content + actions
 * + report info), collapses to single column with stacked actions on
 * smaller viewports. Reported rows get a subtle red ring to draw
 * the eye when scanning the queue. */
export function ReviewCard({ review, busy, onApprove, onDelete }: Props) {
  const targetWord =
    review.target.type === ReviewTargetType.provider
      ? T.targetMaster
      : T.targetStudio;
  return (
    <article
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card",
        review.isReported && "ring-2 ring-red-500/25",
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_180px_220px] lg:items-start">
        {/* Main column — author, target, stars, text */}
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <UserAvatar
              userId={review.authorId ?? review.id}
              name={review.authorDisplay}
            />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-text-main">
                <span className="truncate">{review.authorDisplay}</span>
                {review.isReported ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-red-700 dark:text-red-300">
                    <Flag className="h-2.5 w-2.5" aria-hidden />
                    {T.reportedBadge}
                  </span>
                ) : null}
                {review.isUrgent ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                    {T.urgentBadge}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-sec">
                {DATE_FMT.format(new Date(review.createdAt))}
              </p>
            </div>
          </div>

          {review.target.name ? (
            <p className="mt-3 text-xs text-text-sec">
              {T.onTargetPrefix} {targetWord}{" "}
              <span className="text-text-main">{review.target.name}</span>
            </p>
          ) : null}

          <div className="mt-2">
            <ReviewRatingStars rating={review.rating} />
          </div>

          {review.text ? (
            <p className="mt-3 whitespace-pre-line text-sm text-text-main">
              {review.text}
            </p>
          ) : null}

          {review.replyText ? (
            <p className="mt-3 rounded-xl bg-bg-input/60 px-3 py-2 text-xs text-text-sec">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
                {T.replyBadge}
              </span>
              <span className="ml-2 text-text-main">{review.replyText}</span>
            </p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="lg:order-3 lg:w-[220px]">
          <ReviewActions
            review={review}
            busy={busy}
            onApprove={onApprove}
            onDelete={onDelete}
          />
        </div>

        {/* Report info — lg-order:2 so visual order is text → info → actions */}
        <div className="lg:order-2 lg:w-[180px]">
          <ReviewReportInfo review={review} />
        </div>
      </div>
    </article>
  );
}

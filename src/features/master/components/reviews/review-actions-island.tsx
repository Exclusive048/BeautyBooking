"use client";

import { useState } from "react";
import { Ban, MessageSquare, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import { ReportReviewModal } from "@/features/reviews/components/report-review-modal";
import { UI_TEXT } from "@/lib/ui/text";
import { ReviewReplyForm } from "./review-reply-form";

const T = UI_TEXT.cabinetMaster.reviews.card;

type Props = {
  reviewId: string;
  hasReply: boolean;
  initialReplyText: string | null;
  isReported: boolean;
};

/**
 * Owns the per-card interactive state: the "reply / edit reply" toggle
 * and the report modal. Sits at the bottom of `<ReviewCard>` so the
 * static parts (avatar, body, existing reply) stay server-rendered
 * while only this slim island ships JS.
 *
 * Submits flow into `<ReviewReplyForm>` which calls the page router
 * `refresh()` on success — the server then re-renders the card with the
 * new reply visible, and the form auto-closes via `onSaved`.
 */
export function ReviewActionsIsland({
  reviewId,
  hasReply,
  initialReplyText,
  isReported,
}: Props) {
  const [replyMode, setReplyMode] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const replyLabel = hasReply ? T.editReplyCta : T.replyCta;
  const ReplyIcon = hasReply ? Pencil : MessageSquare;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setReplyMode(true)}
            className={cn(
              "inline-flex items-center gap-1 transition-colors",
              "text-text-sec hover:text-primary"
            )}
          >
            <ReplyIcon className="h-3.5 w-3.5" aria-hidden />
            {replyLabel}
          </button>

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            disabled={isReported}
            className={cn(
              "inline-flex items-center gap-1 transition-colors",
              isReported
                ? "cursor-not-allowed text-text-sec/50"
                : "text-text-sec hover:text-rose-600"
            )}
          >
            <Ban className="h-3.5 w-3.5" aria-hidden />
            {isReported ? T.reportedLabel : T.reportCta}
          </button>
        </div>

        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            hasReply
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          )}
        >
          {hasReply ? T.answeredBadge : T.unansweredBadge}
        </span>
      </div>

      {replyMode ? (
        <ReviewReplyForm
          reviewId={reviewId}
          initialText={hasReply ? initialReplyText : null}
          onCancel={() => setReplyMode(false)}
          onSaved={() => setReplyMode(false)}
        />
      ) : null}

      {reportOpen ? (
        <ReportReviewModal
          reviewId={reviewId}
          open
          onClose={() => setReportOpen(false)}
          onSuccess={() => setReportOpen(false)}
        />
      ) : null}
    </>
  );
}

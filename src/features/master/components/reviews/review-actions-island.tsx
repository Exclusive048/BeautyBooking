"use client";

import { useState } from "react";
import { Ban, MessageSquare, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import { ReportReviewModal } from "@/features/reviews/components/report-review-modal";
import * as UI_TEXT from "@/lib/ui/text";
import { ReviewReplyForm } from "./review-reply-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const T = UI_TEXT.cabinetMaster.reviews.card;
const LINK_BUTTON = "h-auto gap-1 rounded-md px-0 text-xs font-normal hover:bg-transparent";

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
        {/* Ссылки-кнопки с зоной нажатия `sm` (44px, UI-29): текстом высотой
            16px на телефоне попадали через раз. Внешне — та же строка. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplyMode(true)}
            className={cn(LINK_BUTTON, "text-text-sec hover:text-accent-text")}
          >
            <ReplyIcon className="h-3.5 w-3.5" aria-hidden />
            {replyLabel}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReportOpen(true)}
            disabled={isReported}
            className={cn(
              LINK_BUTTON,
              isReported
                ? "cursor-not-allowed text-text-sec/50"
                : "text-text-sec hover:text-danger-text"
            )}
          >
            <Ban className="h-3.5 w-3.5" aria-hidden />
            {isReported ? T.reportedLabel : T.reportCta}
          </Button>
        </div>

        <Badge size="xs" variant={hasReply ? "success" : "warning"}>
          {hasReply ? T.answeredBadge : T.unansweredBadge}
        </Badge>
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

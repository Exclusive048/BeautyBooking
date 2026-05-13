import { AlertTriangle, ShieldCheck } from "lucide-react";
import { reportReasonLabel } from "@/features/admin-cabinet/reviews/lib/report-reason-display";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminReviewRow } from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews.card;

type Props = {
  review: AdminReviewRow;
};

/**
 * Right-column report context. Renders the single report reason +
 * (optional) comment when the review is flagged. NO breakdown
 * counts — multi-reporter is BACKLOG 🟠. Returns a muted "without
 * reports" affordance for un-flagged reviews so the column always
 * occupies the same width on screen (avoids the card resizing as
 * the admin moves through the queue).
 */
export function ReviewReportInfo({ review }: Props) {
  if (!review.isReported) {
    return (
      <div className="flex items-start gap-2 text-xs text-text-sec/70">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{T.noReports}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-red-500/8 p-3">
      <div className="flex items-center gap-1.5 text-red-700 dark:text-red-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
          {T.reportLabel}
        </span>
      </div>
      <p className="text-sm font-medium text-text-main">
        {review.reportReason
          ? reportReasonLabel(review.reportReason)
          : T.reportLabel}
      </p>
      {review.reportComment ? (
        <p className="line-clamp-3 text-xs text-text-sec">
          {review.reportComment}
        </p>
      ) : null}
    </div>
  );
}

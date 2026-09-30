"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioReviewItem } from "../lib/types";
import { ReportReviewDialog } from "./report-review-dialog";
import { ReviewCard } from "./review-card";

const T = UI_TEXT.studioCabinet.reviewsV2;

type Props = {
  reviews: StudioReviewItem[];
};

export function ReviewsList({ reviews }: Props) {
  const [reportingId, setReportingId] = useState<string | null>(null);

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-10 text-center">
        <MessageSquare className="h-10 w-10 text-text-sec/30" aria-hidden />
        <p className="text-base font-semibold text-text-main">{T.empty.title}</p>
        <p className="max-w-md text-sm text-text-sec">{T.empty.hint}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <ReviewCard review={review} onReport={setReportingId} />
          </li>
        ))}
      </ul>
      <ReportReviewDialog reviewId={reportingId} onClose={() => setReportingId(null)} />
    </>
  );
}

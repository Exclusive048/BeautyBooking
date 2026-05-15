"use client";

import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminReviewRow } from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews.actions;

type Props = {
  review: AdminReviewRow;
  busy: boolean;
  onApprove: () => void;
  onDelete: () => void;
};

/** Two-button action column. Approve is shown only when the review
 * is currently reported — there's nothing to "approve" otherwise.
 * Delete is always available because admins occasionally need to
 * remove reviews that aren't reported (spam-from-author, doxxing,
 * etc.). Edit deliberately omitted — UGC integrity (see scope). */
export function ReviewActions({ review, busy, onApprove, onDelete }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {review.isReported ? (
        <Button
          variant="primary"
          size="sm"
          onClick={onApprove}
          disabled={busy}
          className="w-full"
        >
          <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {T.approve}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={busy}
        className="w-full text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300"
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {T.delete}
      </Button>
    </div>
  );
}

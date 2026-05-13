import { Inbox } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminReviewTab } from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews.empty;

type Props = {
  tab: AdminReviewTab;
};

const COPY: Record<AdminReviewTab, { title: string; hint: string }> = {
  flagged: { title: T.flaggedTitle, hint: T.flaggedHint },
  low: { title: T.lowTitle, hint: T.lowHint },
  all: { title: T.allTitle, hint: T.allHint },
};

export function ReviewsEmpty({ tab }: Props) {
  const copy = COPY[tab];
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-bg-card px-4 py-12 text-center shadow-card">
      <Inbox className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden />
      <p className="mb-1 font-display text-base text-text-main">{copy.title}</p>
      <p className="max-w-xs text-sm text-text-sec">{copy.hint}</p>
    </div>
  );
}

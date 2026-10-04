import Link from "next/link";
import { Clock, MessageSquareWarning } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminReportsCounts } from "@/features/admin-cabinet/reports/types";

const T = UI_TEXT.adminPanel.reports;

type Props = {
  counts: AdminReportsCounts;
};

/**
 * «Модерация контента · N ждут ответа · M дольше 24 часов» + напоминание о
 * сроке ответа и ссылка на «Отзывы», где разбираются жалобы мастеров на
 * отзывы о себе (у них своя очередь).
 */
export function ReportsHeader({ counts }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-sec">
        <span>{T.header.caption}</span>
        {counts.new > 0 ? (
          <>
            <span className="mx-1.5 text-text-sec/40" aria-hidden>
              ·
            </span>
            <span>
              <span className="tabular-nums text-warning-text">{counts.new}</span>{" "}
              {T.header.pendingSuffix}
            </span>
          </>
        ) : null}
        {counts.overdue > 0 ? (
          <>
            <span className="mx-1.5 text-text-sec/40" aria-hidden>
              ·
            </span>
            <span>
              <span className="tabular-nums text-danger-text">{counts.overdue}</span>{" "}
              {T.header.overdueSuffix}
            </span>
          </>
        ) : null}
      </p>

      <div className="flex items-start gap-2 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 text-sm text-text-sec shadow-card">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-sec" aria-hidden strokeWidth={1.5} />
        <p>{T.header.slaHint}</p>
      </div>

      {counts.reportedReviews > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 text-sm text-text-sec shadow-card">
          <MessageSquareWarning
            className="h-4 w-4 shrink-0 text-text-sec"
            aria-hidden
            strokeWidth={1.5}
          />
          <span>{T.reviewsNotice(counts.reportedReviews)}</span>
          <Link
            href="/admin/reviews"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            {T.reviewsNoticeLink}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

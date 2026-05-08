import { cn } from "@/lib/cn";
import type { MasterReviewItem } from "@/lib/master/reviews-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import {
  formatRelativeDate,
  getInitials,
  pickAvatarColor,
} from "@/features/master/components/clients/lib/format";
import { ReviewActionsIsland } from "./review-actions-island";
import { ReviewExistingReply } from "./review-existing-reply";
import { StarsDisplay } from "./stars-display";

const T = UI_TEXT.cabinetMaster.reviews.card;
const ANON = UI_TEXT.cabinetMaster.reviews.anon;
const NO_SERVICE = UI_TEXT.cabinetMaster.reviews.noService;

type Props = {
  review: MasterReviewItem;
  /** Master display name shown next to the published reply. */
  masterName: string;
  /** Stable seed for the master-reply avatar colour. */
  masterSeed: string;
  /** Service title surfaced in the meta line (`Маникюр + гель-лак`). */
  serviceName: string | null;
  now: Date;
};

/**
 * Single review card. Server-rendered; all interactive bits live inside
 * the small `<ReviewActionsIsland>` at the bottom (reply form + report
 * modal). The published reply, when present, renders below the actions
 * row as an indented quote block.
 *
 * Photos are intentionally not rendered in 28a — `Review` has no photo
 * relation in the schema yet (see backlog).
 */
export function ReviewCard({ review, masterName, masterSeed, serviceName, now }: Props) {
  const authorName = review.authorName?.trim() || ANON;
  const isAnswered = Boolean(review.replyText);
  const dateLabel = formatRelativeDate(review.createdAt, now);
  const serviceLabel = serviceName?.trim() || NO_SERVICE;

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium",
              pickAvatarColor(review.authorId)
            )}
            aria-hidden
          >
            {getInitials(authorName)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-text-main">{authorName}</p>
              <StarsDisplay rating={review.rating} size="sm" />
            </div>
            <p className="mt-0.5 truncate text-xs text-text-sec">
              {dateLabel} · {serviceLabel}
            </p>
          </div>
        </div>

        {review.isNew ? (
          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {T.newBadge}
          </span>
        ) : null}
      </header>

      {review.text ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-main">
          {review.text}
        </p>
      ) : null}

      <ReviewActionsIsland
        reviewId={review.id}
        hasReply={isAnswered}
        initialReplyText={review.replyText ?? null}
        isReported={Boolean(review.reportedAt)}
      />

      {isAnswered && review.replyText && review.repliedAt ? (
        <ReviewExistingReply
          text={review.replyText}
          repliedAt={review.repliedAt}
          authorName={masterName}
          authorSeed={masterSeed}
          now={now}
        />
      ) : null}
    </article>
  );
}

import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.reviewsV2.header;

type Props = {
  totalReviews: number;
  unansweredCount: number;
};

/**
 * STUDIO-REVIEWS-A header — caption + title + subtitle. Per user spec,
 * no «Запрос отзыва» or «Ответить всем» CTAs (both backlogged) and no
 * bookmark/identity affordances. Reply identity is studio-wide — the
 * subtitle states it upfront so admins know what they're publishing.
 */
export function ReviewsHeader({ totalReviews, unansweredCount }: Props) {
  return (
    <header className="min-w-0">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.caption
          .replace("{total}", String(totalReviews))
          .replace("{noReply}", String(unansweredCount))}
      </p>
      <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
        {T.title}
      </h1>
      <p className="mt-1 max-w-xl text-sm text-text-sec">{T.subtitle}</p>
    </header>
  );
}

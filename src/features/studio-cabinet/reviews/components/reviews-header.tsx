import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";

const T = UI_TEXT.studioCabinet.reviewsV2.header;

type Props = {
  totalReviews: number;
  unansweredCount: number;
};

/**
 * STUDIO-REVIEWS-A header — caption + title. Per user spec, no «Запрос
 * отзыва» or «Ответить всем» CTAs (both backlogged). That replies go out
 * on behalf of the studio is said by the reply itself («Ответ студии»).
 */
export function ReviewsHeader({ totalReviews, unansweredCount }: Props) {
  return (
    <StudioPageHeader
      caption={T.caption
        .replace("{total}", String(totalReviews))
        .replace("{noReply}", String(unansweredCount))}
      title={T.title}
    />
  );
}

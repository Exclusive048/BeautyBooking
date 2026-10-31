import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";

const T = UI_TEXT.studioCabinet.reviewsV2.header;

/**
 * STUDIO-REVIEWS-A header — только заголовок. Per user spec, no «Запрос
 * отзыва» or «Ответить всем» CTAs (both backlogged). Счётчиков и описания
 * нет: число отзывов без ответа видно на фильтре, средняя оценка — на главной
 * кабинета и в аналитике.
 */
export function ReviewsHeader() {
  return (
    <StudioPageHeader title={T.title} />
  );
}

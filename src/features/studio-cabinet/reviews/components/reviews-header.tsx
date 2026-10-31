import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.reviewsV2.header;

/**
 * STUDIO-REVIEWS-A header — только заголовок. Per user spec, no «Запрос
 * отзыва» or «Ответить всем» CTAs (both backlogged). Счётчиков и описания
 * нет: число отзывов без ответа видно на фильтре, средняя оценка — на главной
 * кабинета и в аналитике.
 */
export function ReviewsHeader() {
  return (
    <header className="min-w-0">
      <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
        {T.title}
      </h1>
    </header>
  );
}

import { PortfolioStrip, type PortfolioWork } from "@/features/public-profile/master/portfolio-strip";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { emptyOnRefusal } from "@/features/public-profile/master/server/refusal";
import { listPortfolioFeed } from "@/lib/feed/portfolio.service";
import { workSubjectTitle } from "@/lib/feed/work-caption";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  providerId: string;
};

/**
 * Работы мастера для ленты на его странице. Наружу — только то, что ей нужно:
 * подпись — услуга (иначе одобренная категория), без имени мастера — страница
 * и так его (замечание владельца 2026-10-12); пометка «в поиске» — для
 * кабинета, публике её не отдаём.
 */
async function fetchPortfolio(providerId: string): Promise<PortfolioWork[]> {
  const feed = await emptyOnRefusal(
    () => listPortfolioFeed({ limit: 8, masterId: providerId }),
    { items: [], nextCursor: null },
  );
  return feed.items.map((item) => ({
    id: item.id,
    mediaUrl: item.mediaUrl,
    caption: item.caption,
    subject: workSubjectTitle(item.primaryServiceTitle, item.categoryTitle),
  }));
}

export async function PortfolioSection({ providerId }: Props) {
  let items: PortfolioWork[] = [];
  let hasError = false;

  try {
    items = await fetchPortfolio(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-portfolio", error, ["listPortfolioFeed"]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.blockLoadFailed}
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <PortfolioStrip items={items} />
    </div>
  );
}

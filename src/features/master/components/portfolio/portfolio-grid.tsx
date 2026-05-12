import type {
  PortfolioCategoryOption,
  PortfolioItemView,
  PortfolioServiceOption,
  PortfolioTagOption,
} from "@/lib/master/portfolio-view.service";
import { PortfolioCard } from "./portfolio-card";

type Props = {
  items: PortfolioItemView[];
  categories: PortfolioCategoryOption[];
  services: PortfolioServiceOption[];
  masterTags: PortfolioTagOption[];
};

/**
 * Responsive grid: 2 cols mobile · 3 tablet · 4 desktop. Reorder
 * boundary state comes from each item's `globalIndex` / `globalCount`
 * — populated by the aggregator from the unfiltered list — so arrows
 * stay correct even when a filter narrows the visible cards.
 */
export function PortfolioGrid({ items, categories, services, masterTags }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <PortfolioCard
          key={item.id}
          item={item}
          isFirst={item.globalIndex === 0}
          isLast={item.globalIndex === item.globalCount - 1}
          categories={categories}
          services={services}
          masterTags={masterTags}
        />
      ))}
    </div>
  );
}

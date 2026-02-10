import type { PortfolioFeedItem } from "@/lib/feed/portfolio.service";
import { PortfolioCard } from "@/features/home/components/portfolio-card";

type Props = {
  items: PortfolioFeedItem[];
  onSelect: (id: string) => void;
};

export function PortfolioGrid({ items, onSelect }: Props) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {items.map((item) => (
        <PortfolioCard key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}

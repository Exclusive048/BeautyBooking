import Image from "next/image";
import type { PortfolioFeedItem } from "@/lib/feed/portfolio.service";

type Props = {
  item: PortfolioFeedItem;
  onSelect: (id: string) => void;
};

export function PortfolioCard({ item, onSelect }: Props) {
  const title = item.primaryServiceTitle ?? item.masterName;
  const subtitle = item.primaryServiceTitle ? item.masterName : null;

  return (
    <article className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[30px] border border-border-subtle/80 bg-bg-card/95 shadow-card transition-all duration-300 hover:shadow-hover">
      <button type="button" onClick={() => onSelect(item.id)} className="relative block w-full text-left">
        <div className="relative aspect-[3/4] w-full">
          <Image
            src={item.mediaUrl}
            alt={item.caption ?? title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4">
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/80">{subtitle}</div> : null}
        </div>
      </button>
    </article>
  );
}

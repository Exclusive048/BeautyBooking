"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import type { PortfolioFeedItem } from "@/lib/feed/portfolio.service";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  item: PortfolioFeedItem;
  index: number;
};

function formatPriceRub(kopeks: number): string {
  return `${Math.round(kopeks / 100).toLocaleString("ru-RU")} ${UI_TEXT.common.currencyRub}`;
}

export function FeedCard({ item, index }: Props) {
  const router = useRouter();
  const T = UI_TEXT.homeFeed;
  const profileHref = item.masterPublicUsername ? `/u/${item.masterPublicUsername}` : null;
  const priceRub = item.totalPrice > 0 ? formatPriceRub(item.totalPrice) : null;
  const rating = item.masterRatingAvg > 0 ? item.masterRatingAvg.toFixed(1) : null;
  const altText = item.caption ?? item.primaryServiceTitle ?? item.masterName;
  const subline = [item.primaryServiceTitle, item.studioName].filter(Boolean).join(" · ");

  const Inner = (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border-subtle/60 bg-bg-card shadow-card transition-shadow duration-200 hover:shadow-hover"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        <Image
          src={item.mediaUrl}
          alt={altText}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          priority={index < 3}
        />
        {rating ? (
          <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-bg-card/90 px-2 py-1 shadow-sm backdrop-blur-sm">
            <Star className="h-3 w-3 fill-primary text-primary" aria-hidden />
            <span className="font-mono text-xs font-semibold tabular-nums text-text-main">
              {rating}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 p-3 sm:p-4">
        <h3 className="truncate font-display text-base font-medium text-text-main sm:text-lg">
          {item.masterName}
        </h3>
        {subline ? (
          <p className="truncate text-xs text-text-sec sm:text-sm">{subline}</p>
        ) : null}
        {priceRub ? (
          <p className="mt-0.5 font-display text-sm italic text-primary sm:text-base">
            {T.card.priceFrom} {priceRub}
          </p>
        ) : null}
      </div>
    </motion.article>
  );

  if (!profileHref) {
    return Inner;
  }

  return (
    <Link
      href={profileHref}
      onMouseEnter={() => router.prefetch(profileHref)}
      onFocus={() => router.prefetch(profileHref)}
      aria-label={`${item.masterName}${subline ? ` — ${subline}` : ""}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page rounded-2xl"
    >
      {Inner}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { ResilientImage } from "@/components/ui/resilient-image";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import type { PortfolioFeedItem } from "@/lib/feed/portfolio.service";
import { formatWorkCaption } from "@/lib/feed/work-caption";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  item: PortfolioFeedItem;
  index: number;
};

function formatPriceRub(kopeks: number): string {
  return `${Math.round(kopeks / 100).toLocaleString("ru-RU")} ${UI_TEXT.common.currencyRub}`;
}

/**
 * Плитка ленты на главной. HOME-FEED-DENSE (2026-09-24): сетка стала 3 в ряд на
 * телефоне и 6 на ПК, поэтому карточка компактная — фото с подписью работы
 * («мастер · услуга», снизу слева, полупрозрачно) и под ним автор с ценой.
 * Подпись — та же, что в историях (`formatWorkCaption`).
 */
export function FeedCard({ item, index }: Props) {
  const router = useRouter();
  const T = UI_TEXT.homeFeed;
  const reduce = useReducedMotion();
  const profileHref = item.masterPublicUsername ? `/u/${item.masterPublicUsername}` : null;
  const priceRub = item.totalPrice > 0 ? formatPriceRub(item.totalPrice) : null;
  const rating = item.masterRatingAvg > 0 ? item.masterRatingAvg.toFixed(1) : null;
  const workCaption = formatWorkCaption(item.performerName, item.primaryServiceTitle);
  const altText = item.caption ?? workCaption ?? item.masterName;
  const ariaSubline = [workCaption, item.studioName].filter(Boolean).join(" · ");

  const Inner = (
    <motion.article
      initial={reduce ? false : { opacity: 0 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border-subtle/60 bg-bg-card shadow-card transition-shadow duration-200 hover:shadow-hover"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        <ResilientImage
          src={item.mediaUrl}
          alt={altText}
          sizes="(min-width: 1024px) 16vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          priority={index < 6}
        />
        {rating ? (
          <div className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-bg-card/90 px-1.5 py-0.5 shadow-sm backdrop-blur-sm sm:left-2 sm:top-2 sm:gap-1 sm:px-2">
            <Star className="h-2.5 w-2.5 fill-primary text-accent-text sm:h-3 sm:w-3" aria-hidden />
            <span className="font-mono text-[10px] font-semibold tabular-nums text-text-main sm:text-xs">
              {rating}
            </span>
          </div>
        ) : null}
        {workCaption ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-1.5 pb-1 pt-5 sm:px-2 sm:pb-1.5 sm:pt-6">
            <p className="truncate text-[10px] font-medium leading-tight text-white/85 sm:text-xs">
              {workCaption}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5 sm:px-2.5 sm:py-2">
        <h3 className="truncate text-xs font-medium text-text-main sm:text-sm">
          {item.masterName}
        </h3>
        {priceRub ? (
          <p className="truncate font-display text-[11px] italic text-accent-text sm:text-xs">
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
      aria-label={`${item.masterName}${ariaSubline ? ` — ${ariaSubline}` : ""}`}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
    >
      {Inner}
    </Link>
  );
}

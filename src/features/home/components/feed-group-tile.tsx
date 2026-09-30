"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { m, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { IMAGE_ZOOM } from "@/components/ui/motion-classes";
import { Button } from "@/components/ui/button";
import { FavoriteToggleButton } from "@/components/ui/favorite-toggle-button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { formatWorkCaption } from "@/lib/feed/work-caption";
import type { HomeFeedGroup } from "@/lib/feed/home-feed.service";
import { MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { COLLAGE_RATIO_CLASS, type CollageRatio } from "@/features/home/lib/collage-layout";

type Props = {
  group: HomeFeedGroup;
  ratio: CollageRatio;
  priority: boolean;
  isAuthenticated: boolean;
  favorited: boolean;
  onFavoritedChange: (next: boolean) => void;
};

const T = UI_TEXT.homeFeed.card;

function formatPriceRub(kopeks: number): string {
  return `${Math.round(kopeks / 100).toLocaleString("ru-RU")} ${UI_TEXT.common.currencyRub}`;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

/**
 * HOME-FEED-COLLAGE — плитка коллажа на главной: группа загрузки одного автора
 * (работы в пределах 48 часов). Одна работа — просто фото, несколько —
 * карусель: свайп на телефоне, стрелки на ПК. Подпись и цена — у текущей работы.
 *
 * Ссылка на автора накрывает фото и содержит сам скроллер (свайп листает, тап
 * открывает профиль); кнопки — избранное и стрелки — стоят РЯДОМ со ссылкой,
 * а не внутри неё: кнопка внутри `<a>` — невалидная разметка.
 */
export function FeedGroupTile({
  group,
  ratio,
  priority,
  isAuthenticated,
  favorited,
  onFavoritedChange,
}: Props) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const total = group.works.length;
  const current = group.works[Math.min(active, total - 1)] ?? group.works[0]!;
  const profileHref = group.authorPublicUsername ? `/u/${group.authorPublicUsername}` : null;
  const workCaption = formatWorkCaption(current.performerName, current.primaryServiceTitle);
  const priceRub = current.totalPrice > 0 ? formatPriceRub(current.totalPrice) : null;
  const rating = group.authorRatingAvg > 0 ? group.authorRatingAvg.toFixed(1) : null;
  const isCarousel = total > 1;

  const handleScroll = () => {
    const node = scrollerRef.current;
    if (!node || node.clientWidth === 0) return;
    const next = Math.round(node.scrollLeft / node.clientWidth);
    if (next !== active) setActive(Math.max(0, Math.min(total - 1, next)));
  };

  const goTo = (index: number) => {
    const node = scrollerRef.current;
    if (!node) return;
    const target = Math.max(0, Math.min(total - 1, index));
    node.scrollTo({ left: target * node.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  const slides = (
    <div
      ref={scrollerRef}
      onScroll={isCarousel ? handleScroll : undefined}
      className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-hide"
    >
      {group.works.map((work, index) => {
        const caption = formatWorkCaption(work.performerName, work.primaryServiceTitle);
        return (
          <div
            key={work.id}
            className="relative h-full w-full shrink-0 snap-start snap-always"
            role={isCarousel ? "group" : undefined}
            aria-roledescription={isCarousel ? "slide" : undefined}
            aria-label={
              isCarousel ? fill(T.slideAria, { current: index + 1, total }) : undefined
            }
          >
            <ResilientImage
              src={work.mediaUrl}
              alt={work.caption ?? caption ?? group.authorName}
              sizes="(min-width: 1024px) 16vw, 33vw"
              priority={priority && index === 0}
              loading={priority && index === 0 ? undefined : "lazy"}
              className={`object-cover ${IMAGE_ZOOM}`}
            />
          </div>
        );
      })}
    </div>
  );

  const overlay = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2 pb-1.5 pt-8 sm:px-2.5 sm:pb-2">
      {workCaption ? (
        <p className="truncate text-[10px] leading-tight text-white/80 sm:text-xs">
          {workCaption}
        </p>
      ) : null}
      <div className="flex min-w-0 items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium leading-snug text-white sm:text-sm">
          {group.authorName}
        </p>
        {/* На телефоне плитка ~110px — рейтинг съедал бы имя автора. */}
        {rating ? (
          <span className="hidden shrink-0 items-center gap-0.5 text-xs text-white/90 sm:inline-flex">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            <span className="font-mono tabular-nums">{rating}</span>
          </span>
        ) : null}
      </div>
      {priceRub ? (
        <p className="truncate font-display text-[10px] italic leading-tight text-white/90 sm:text-xs">
          {T.priceFrom} {priceRub}
        </p>
      ) : null}
    </div>
  );

  const surfaceLabel = [group.authorName, workCaption].filter(Boolean).join(" — ");
  let surface: ReactNode;
  if (profileHref) {
    surface = (
      <Link
        href={profileHref}
        onMouseEnter={() => router.prefetch(profileHref)}
        onFocus={() => router.prefetch(profileHref)}
        aria-label={surfaceLabel}
        className="absolute inset-0 block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
      >
        {slides}
        {overlay}
      </Link>
    );
  } else {
    surface = (
      <div className="absolute inset-0">
        {slides}
        {overlay}
      </div>
    );
  }

  return (
    <m.article
      data-testid="home-feed-tile"
      data-works={total}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={MOTION.base}
      aria-roledescription={isCarousel ? "carousel" : undefined}
      aria-label={isCarousel ? fill(T.carouselAria, { author: group.authorName }) : undefined}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl bg-bg-input shadow-card",
        COLLAGE_RATIO_CLASS[ratio],
      )}
    >
      {surface}

      {isCarousel ? (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/25 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white backdrop-blur-sm sm:left-2 sm:top-2 sm:text-[11px]">
          {fill(T.worksCounter, { current: active + 1, total })}
        </span>
      ) : null}

      {group.authorPublicUsername ? (
        <FavoriteToggleButton
          providerUsername={group.authorPublicUsername}
          favorited={favorited}
          onFavoritedChange={onFavoritedChange}
          isAuthenticated={isAuthenticated}
          variant="glass"
          className="absolute right-0 top-0 z-10 sm:right-0.5 sm:top-0.5"
        />
      ) : null}

      {isCarousel ? (
        <>
          <CarouselArrow
            side="left"
            label={T.previousWork}
            hidden={active === 0}
            onClick={() => goTo(active - 1)}
          />
          <CarouselArrow
            side="right"
            label={T.nextWork}
            hidden={active >= total - 1}
            onClick={() => goTo(active + 1)}
          />
        </>
      ) : null}
    </m.article>
  );
}

/**
 * Стрелка карусели — только на ПК (`lg`): на телефоне и планшете листают
 * свайпом, а невидимая кнопка у края плитки перехватывала бы тап по фото.
 */
function CarouselArrow({
  side,
  label,
  hidden,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  hidden: boolean;
  onClick: () => void;
}) {
  if (hidden) return null;
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="wrapper"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white opacity-0 backdrop-blur-sm hover:bg-black/40 focus-visible:opacity-100 group-hover:opacity-100 lg:grid",
        side === "left" ? "left-1.5" : "right-1.5",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </Button>
  );
}

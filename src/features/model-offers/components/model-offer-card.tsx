"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { CalendarDays, Clock, MapPin, Star, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { PublicModelOfferItem } from "@/lib/model-offers/public.service";

type Props = {
  offer: PublicModelOfferItem;
  index?: number;
};

export function ModelOfferCard({ offer, index = 0 }: Props) {
  const isFree = offer.price === null || offer.price === 0;
  const priceLabel = isFree
    ? UI_TEXT.pages.models.priceFree
    : `${offer.price} ${UI_TEXT.common.currencyRub}`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <Link
        href={`/models/${offer.publicCode}`}
        className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`${offer.service.title} — ${offer.master.name}`}
      >
        {/* Price badge */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              isFree
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "bg-primary/10 text-primary"
            )}
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {isFree ? UI_TEXT.pages.models.badgeFree : priceLabel}
          </span>
          {offer.service.category?.title ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {offer.service.category.title}
            </span>
          ) : null}
        </div>

        {/* Master info */}
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
            {offer.master.avatarUrl ? (
              <Image
                src={offer.master.avatarUrl}
                alt={offer.master.name}
                fill
                className="object-cover"
                sizes="44px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                {offer.master.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {offer.master.name}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
              <span>{offer.master.ratingAvg.toFixed(1)}</span>
              {offer.master.city ? (
                <>
                  <span aria-hidden>·</span>
                  <MapPin className="h-3 w-3" aria-hidden />
                  <span className="truncate">{offer.master.city}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Service title */}
        <div className="mt-4 flex-1">
          <h3 className="text-base font-semibold text-foreground">{offer.service.title}</h3>
          {offer.service.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {offer.service.description}
            </p>
          ) : null}
        </div>

        {/* Date / time / duration */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary/70" aria-hidden />
            <span>{offer.dateLocal}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 text-primary/70" aria-hidden />
            <span>
              {offer.timeRangeStartLocal}–{offer.timeRangeEndLocal}
              <span className="ml-1 text-xs">
                ({offer.service.durationMin} {UI_TEXT.common.minutesShort})
              </span>
            </span>
          </div>
        </div>

        {/* CTA row */}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <div className="text-sm font-bold text-primary">
            {isFree ? UI_TEXT.pages.models.priceFree : priceLabel}
          </div>
          <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            {UI_TEXT.pages.models.applyAction} →
          </span>
        </div>
      </Link>
    </motion.article>
  );
}

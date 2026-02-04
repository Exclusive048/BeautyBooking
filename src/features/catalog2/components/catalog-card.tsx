"use client";

import Link from "next/link";
import { PhotoCarousel } from "@/features/catalog2/components/photo-carousel";
import { moneyRUB } from "@/lib/format";
import { UI_TEXT } from "@/lib/ui/text";

type CatalogCardItem = {
  type: "master" | "studio";
  id: string;
  title: string;
  avatarUrl: string | null;
  ratingAvg: number;
  reviewsCount: number;
  photos: string[];
  minPrice: number | null;
  primaryService: {
    title: string;
    price: number;
    durationMin: number;
  } | null;
  nextSlot: { startAt: string } | null;
  todaySlotsCount?: number;
};

type CatalogCardProps = {
  item: CatalogCardItem;
  serviceQuery: string;
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CatalogCard({ item, serviceQuery }: CatalogCardProps) {
  const hasServiceQuery = serviceQuery.trim().length > 0;
  const href = item.type === "studio" ? `/studios/${item.id}` : `/providers/${item.id}`;

  const priceText =
    hasServiceQuery && item.primaryService && item.primaryService.price > 0
      ? `${item.primaryService.title} ${UI_TEXT.catalog.priceAllIncluded}: ${moneyRUB(item.primaryService.price)}`
      : item.minPrice && item.minPrice > 0
        ? `${UI_TEXT.catalog.priceFrom} ${moneyRUB(item.minPrice)}`
        : UI_TEXT.catalog.priceOnRequest;

  const slotText = item.nextSlot
    ? `${UI_TEXT.catalog.nextSlotLabel}: ${formatDateTime(item.nextSlot.startAt)}`
    : item.todaySlotsCount && item.todaySlotsCount > 0
      ? `${item.todaySlotsCount} ${UI_TEXT.catalog.todaySlotsLabel}`
      : UI_TEXT.catalog.noSlots;

  const showNew = item.reviewsCount <= 0;

  return (
    <Link
      href={href}
      aria-label={item.title}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
    >
      <article>
        <PhotoCarousel photos={item.photos} alt={item.title} />

        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            {item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.avatarUrl}
                alt={item.title}
                className={`h-10 w-10 object-cover ${item.type === "master" ? "rounded-full" : "rounded-lg"}`}
                loading="lazy"
              />
            ) : (
              <div className={`h-10 w-10 bg-muted ${item.type === "master" ? "rounded-full" : "rounded-lg"}`} />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
              <div className="text-xs text-muted-foreground">
                {showNew
                  ? UI_TEXT.catalog.newLabel
                  : `${item.ratingAvg.toFixed(1)} ? ${item.reviewsCount} ${UI_TEXT.catalog.reviewsLabel}`}
              </div>
            </div>
          </div>

          <div className="text-sm text-foreground">{priceText}</div>
          <div className="rounded-xl border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            {slotText}
          </div>
        </div>
      </article>
    </Link>
  );
}

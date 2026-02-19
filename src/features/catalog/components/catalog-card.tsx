"use client";

import Link from "next/link";
import { PhotoCarousel } from "@/features/catalog/components/photo-carousel";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { moneyRUB } from "@/lib/format";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl } from "@/lib/public-urls";

type CatalogCardItem = {
  type: "master" | "studio";
  id: string;
  publicUsername: string | null;
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

export function CatalogCard({ item, serviceQuery }: CatalogCardProps) {
  const viewerTimeZone = useViewerTimeZoneContext();
  const hasServiceQuery = serviceQuery.trim().length > 0;
  const href = providerPublicUrl({ id: item.id, publicUsername: item.publicUsername }, "catalog-card");

  const priceText =
    hasServiceQuery && item.primaryService && item.primaryService.price > 0
      ? `${item.primaryService.title} ${UI_TEXT.catalog.priceAllIncluded}: ${moneyRUB(item.primaryService.price)}`
      : item.minPrice && item.minPrice > 0
        ? `${UI_TEXT.catalog.priceFrom} ${moneyRUB(item.minPrice)}`
        : UI_TEXT.catalog.priceOnRequest;

  const slotText = item.nextSlot
    ? `${UI_TEXT.catalog.nextSlotLabel}: ${UI_FMT.dateTimeShort(item.nextSlot.startAt, {
        timeZone: viewerTimeZone,
      })}`
    : item.todaySlotsCount && item.todaySlotsCount > 0
      ? `${item.todaySlotsCount} ${UI_TEXT.catalog.todaySlotsLabel}`
      : UI_TEXT.catalog.noSlots;

  const showNew = item.reviewsCount <= 0;

  const cardBody = (
    <article>
      <PhotoCarousel photos={item.photos} alt={item.title} />

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          {item.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.avatarUrl}
              alt={item.title}
              className={`h-10 w-10 object-cover ring-1 ring-border-subtle ${item.type === "master" ? "rounded-full" : "rounded-xl"}`}
              loading="lazy"
            />
          ) : (
            <div className={`h-10 w-10 bg-muted ${item.type === "master" ? "rounded-full" : "rounded-xl"}`} />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-main">{item.title}</div>
            <div className="text-xs text-text-sec">
              {showNew
                ? UI_TEXT.catalog.newLabel
                : `${item.ratingAvg.toFixed(1)} ? ${item.reviewsCount} ${UI_TEXT.catalog.reviewsLabel}`}
            </div>
          </div>
        </div>

        <div className="text-sm text-text-main">{priceText}</div>
        <div className="rounded-2xl border border-border-subtle bg-bg-input/80 px-3 py-2 text-xs text-text-sec">
          {slotText}
        </div>
      </div>
    </article>
  );

  const baseClass =
    "group block overflow-hidden rounded-[28px] border border-border-subtle/80 bg-bg-card shadow-card transition-all duration-300";
  const interactiveClass =
    "hover:scale-[1.01] hover:shadow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/40";

  return (
    <Link href={href} aria-label={item.title} className={`${baseClass} ${interactiveClass}`}>
      {cardBody}
    </Link>
  );
}

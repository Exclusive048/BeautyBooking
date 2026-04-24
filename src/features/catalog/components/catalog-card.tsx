"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoCarousel } from "@/features/catalog/components/photo-carousel";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { moneyRUB } from "@/lib/format";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl } from "@/lib/public-urls";
import { FocalImage } from "@/components/ui/focal-image";

type CatalogCardItem = {
  type: "master" | "studio";
  id: string;
  publicUsername: string | null;
  title: string;
  tagline: string | null;
  avatarUrl: string | null;
  avatarFocalX: number | null;
  avatarFocalY: number | null;
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
  isHighlighted?: boolean;
};

type CatalogCardProps = {
  item: CatalogCardItem;
  serviceQuery: string;
};

export function CatalogCard({ item, serviceQuery }: CatalogCardProps) {
  const router = useRouter();
  const viewerTimeZone = useViewerTimeZoneContext();
  const hasServiceQuery = serviceQuery.trim().length > 0;
  const href = providerPublicUrl({ id: item.id, publicUsername: item.publicUsername }, "catalog-card") ?? "#";
  const bookingHref = item.publicUsername ? `/u/${item.publicUsername}/booking` : "#";

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
  const masterHashtag =
    item.type === "master" && item.tagline
      ? item.tagline.trim().replace(/^#+/, "")
      : "";

  const cardClass = `group relative overflow-hidden rounded-[28px] bg-bg-card shadow-card transition-all duration-300 ${
    item.isHighlighted
      ? "border-2 border-primary/40 ring-1 ring-primary/20"
      : "border border-border-subtle/80"
  } hover:scale-[1.01] hover:shadow-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/40`;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={item.title}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      className={cardClass}
    >
      <article>
        {item.isHighlighted && (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            {UI_TEXT.catalog.highlightBadge}
          </div>
        )}

        <PhotoCarousel photos={item.photos} alt={item.title} />

        {/* Hover booking overlay — appears over the photo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex aspect-[4/3] items-end justify-center pb-3 opacity-0 transition-opacity duration-300 group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="absolute inset-0 rounded-t-[24px] bg-gradient-to-t from-black/50 to-transparent" />
          <Link
            href={bookingHref}
            onClick={(e) => e.stopPropagation()}
            className="relative rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 active:scale-95"
          >
            {UI_TEXT.catalog.book}
          </Link>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            {item.avatarUrl ? (
              <FocalImage
                src={item.avatarUrl}
                alt={item.title}
                focalX={item.avatarFocalX}
                focalY={item.avatarFocalY}
                width={40}
                height={40}
                loading="lazy"
                className={`object-cover ring-1 ring-border-subtle ${item.type === "master" ? "rounded-full" : "rounded-xl"}`}
              />
            ) : (
              <div className={`h-10 w-10 bg-muted ${item.type === "master" ? "rounded-full" : "rounded-xl"}`} />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-main">{item.title}</div>
              {masterHashtag ? (
                <span className="mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                  #{masterHashtag}
                </span>
              ) : null}
              <div className="text-xs text-text-sec">
                {showNew
                  ? UI_TEXT.catalog.newLabel
                  : `${item.ratingAvg.toFixed(1)} · ${item.reviewsCount} ${UI_TEXT.catalog.reviewsLabel}`}
              </div>
            </div>
          </div>

          <div className="text-sm text-text-main">{priceText}</div>
          <div className="rounded-2xl border border-border-subtle bg-bg-input/80 px-3 py-2 text-xs text-text-sec">
            {slotText}
          </div>
        </div>
      </article>
    </div>
  );
}

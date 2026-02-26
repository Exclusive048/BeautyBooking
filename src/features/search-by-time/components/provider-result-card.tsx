"use client";

import Link from "next/link";
import { PhotoCarousel } from "@/features/catalog/components/photo-carousel";
import { SlotBubblesRow } from "@/features/search-by-time/components/slot-bubbles-row";
import type { AvailabilityProviderItem } from "@/lib/search-by-time/types";
import { moneyRUB } from "@/lib/format";
import { providerPublicUrl } from "@/lib/public-urls";
import { UI_TEXT } from "@/lib/ui/text";
import { FocalImage } from "@/components/ui/focal-image";

type Props = {
  item: AvailabilityProviderItem;
};

export function ProviderResultCard({ item }: Props) {
  const showNew = item.reviewsCount <= 0;
  const priceText =
    item.service.price > 0
      ? `${item.service.title} ${UI_TEXT.catalog.priceAllIncluded}: ${moneyRUB(item.service.price)}`
      : item.priceFrom && item.priceFrom > 0
        ? `${UI_TEXT.catalog.priceFrom} ${moneyRUB(item.priceFrom)}`
        : UI_TEXT.catalog.priceOnRequest;

  const href = providerPublicUrl({ id: item.providerId, publicUsername: item.publicUsername }, "search-result-card");

  return (
    <article className="overflow-hidden rounded-[28px] border border-border-subtle/80 bg-bg-card shadow-card">
      <Link href={href} aria-label={item.name} className="group block transition hover:opacity-95">
        <PhotoCarousel photos={item.photos} alt={item.name} />
      </Link>

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          {item.avatarUrl ? (
            <FocalImage
              src={item.avatarUrl}
              alt={item.name}
              focalX={item.avatarFocalX}
              focalY={item.avatarFocalY}
              className={`h-10 w-10 object-cover ring-1 ring-border-subtle ${item.providerType === "MASTER" ? "rounded-full" : "rounded-xl"}`}
              loading="lazy"
            />
          ) : (
            <div
              className={`h-10 w-10 bg-muted ${item.providerType === "MASTER" ? "rounded-full" : "rounded-xl"}`}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-main">{item.name}</div>
            <div className="text-xs text-text-sec">
              {showNew
                ? UI_TEXT.catalog.newLabel
                : `${item.ratingAvg.toFixed(1)} • ${item.reviewsCount} ${UI_TEXT.catalog.reviewsLabel}`}
            </div>
          </div>
        </div>

        <div className="text-sm text-text-main">{priceText}</div>

        <div className="text-xs text-text-sec">{UI_TEXT.catalog.timeSearch.freeInTime}</div>
        <SlotBubblesRow
          provider={{ id: item.providerId, publicUsername: item.publicUsername }}
          serviceId={item.service.id}
          slots={item.slots}
        />
      </div>
    </article>
  );
}

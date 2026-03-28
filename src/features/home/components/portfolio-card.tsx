import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PortfolioFeedItem } from "@/lib/feed/portfolio.service";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  item: PortfolioFeedItem;
  onSelect: (id: string) => void;
};

export function PortfolioCard({ item, onSelect }: Props) {
  const serviceLabel = item.primaryServiceTitle;

  const bookingUrl = item.masterPublicUsername
    ? `/u/${item.masterPublicUsername}/booking`
    : null;
  const profileUrl = item.masterPublicUsername
    ? `/u/${item.masterPublicUsername}`
    : null;

  const initials = item.masterName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[30px] border border-border-subtle/80 bg-bg-card/95 shadow-card transition-all duration-300 hover:shadow-hover">
      {/* Image area — click opens preview modal */}
      <Button
        variant="wrapper"
        onClick={() => onSelect(item.id)}
        className="relative block w-full text-left"
        aria-label={serviceLabel ?? item.masterName}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-[28px]">
          <Image
            src={item.mediaUrl}
            alt={item.caption ?? serviceLabel ?? item.masterName}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />

          {/* Price badge — top right */}
          {item.totalPrice > 0 ? (
            <div className="pointer-events-none absolute right-3 top-3 rounded-xl bg-black/50 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              {UI_TEXT.home.card.priceFrom} {item.totalPrice} {UI_TEXT.common.currencyRub}
            </div>
          ) : null}

          {/* Hover overlay — desktop: subtle darkening */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
      </Button>

      {/* Bottom action strip */}
      <div className="flex items-center gap-2.5 px-3 pb-3 pt-2.5">
        {/* Avatar */}
        <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary/10">
          {item.masterAvatarUrl ? (
            <Image
              src={item.masterAvatarUrl}
              alt={item.masterName}
              width={28}
              height={28}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-primary">
              {initials}
            </span>
          )}
        </div>

        {/* Name + service */}
        <div className="min-w-0 flex-1">
          {profileUrl ? (
            <Link
              href={profileUrl}
              className="block truncate text-xs font-semibold text-text-main transition-colors hover:text-primary"
            >
              {item.masterName}
            </Link>
          ) : (
            <div className="truncate text-xs font-semibold text-text-main">
              {item.masterName}
            </div>
          )}
          {serviceLabel ? (
            <div className="truncate text-[11px] text-text-sec">{serviceLabel}</div>
          ) : null}
        </div>

        {/* Booking button */}
        {bookingUrl ? (
          <Button asChild size="sm" className="shrink-0">
            <Link href={bookingUrl}>{UI_TEXT.home.card.book}</Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

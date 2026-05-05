"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, Star } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { moneyRUB } from "@/lib/format";
import { UI_FMT } from "@/lib/ui/fmt";
import { hueFromId } from "@/lib/utils/hue-from-id";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl } from "@/lib/public-urls";
import type { ApiResponse } from "@/lib/types/api";

type CatalogCardItem = {
  type: "master" | "studio";
  id: string;
  publicUsername: string | null;
  title: string;
  tagline: string | null;
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
  isHighlighted?: boolean;
};

type Props = {
  item: CatalogCardItem;
  serviceQuery: string;
  /** Initial heart state (server-resolved per session). Defaults to false for anonymous users. */
  initialFavorited?: boolean;
  /** When true, clicks call the toggle endpoint. When false, clicks bubble up via `onLoginRequired`. */
  isAuthenticated?: boolean;
  /** Called when an anonymous user attempts to favorite — orchestrator decides UX (modal, toast, redirect). */
  onLoginRequired?: () => void;
};

const TC = UI_TEXT.catalog2.card;

/**
 * MasterCard redesigned to align with the catalog reference (Commit 22a):
 *   - Photo (when present) or hue-rotated gradient placeholder (when absent)
 *   - Premium badge top-left ("PRO")
 *   - Save heart top-right (visual-only — functional in 22b)
 *   - Avatar + name + tagline
 *   - Rating row with star
 *   - Footer: "от X ₽" + slot indicator with green dot
 *
 * Hue placeholder is deterministic via `hueFromId(item.id)` — masters without
 * portfolio still get a stable, distinctive card colour across renders.
 */
export function CatalogCard({
  item,
  serviceQuery,
  initialFavorited = false,
  isAuthenticated = false,
  onLoginRequired,
}: Props) {
  const router = useRouter();
  const viewerTimeZone = useViewerTimeZoneContext();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  async function handleFavoriteToggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setFavoriteError(null);

    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    if (favoritePending) return;

    // Optimistic flip — orchestrator sees the new state immediately, network
    // happens after. Roll back on any non-2xx (the surface message comes
    // from UI_TEXT, never the API body, to keep wording consistent).
    const next = !favorited;
    setFavorited(next);
    setFavoritePending(true);
    try {
      const res = await fetch("/api/favorites/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: item.id }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ favorited: boolean }>
        | null;

      if (!res.ok || !json || !json.ok) {
        setFavorited(!next);
        if (res.status === 429) {
          setFavoriteError(UI_TEXT.catalog2.favoriteToggle.errorRateLimited);
        } else {
          setFavoriteError(UI_TEXT.catalog2.favoriteToggle.errorGeneric);
        }
        return;
      }
      // Reconcile with the server's view in case of a race.
      setFavorited(json.data.favorited);
    } catch {
      setFavorited(!next);
      setFavoriteError(UI_TEXT.catalog2.favoriteToggle.errorGeneric);
    } finally {
      setFavoritePending(false);
    }
  }
  const href = providerPublicUrl({ id: item.id, publicUsername: item.publicUsername }, "catalog-card") ?? "#";
  const bookingHref = item.publicUsername ? `/u/${item.publicUsername}/booking` : "#";

  const hasServiceQuery = serviceQuery.trim().length > 0;
  const priceText =
    hasServiceQuery && item.primaryService && item.primaryService.price > 0
      ? moneyRUB(item.primaryService.price)
      : item.minPrice && item.minPrice > 0
        ? moneyRUB(item.minPrice)
        : "—";

  const slotText = item.nextSlot
    ? UI_FMT.dateTimeShort(item.nextSlot.startAt, { timeZone: viewerTimeZone })
    : null;

  const isNew = item.reviewsCount <= 0;
  const photo = item.photos[0] ?? null;
  const hue = hueFromId(item.id);

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={item.title}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card transition-all duration-200 hover:border-primary/30 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/40"
    >
      {/* Photo / hue placeholder. Aspect-[4/3] matches reference proportions. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {photo ? (
          <FocalImage
            src={photo}
            alt={item.title}
            width={400}
            height={300}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 70% 70%), hsl(${(hue + 30) % 360} 60% 55%))`,
            }}
          />
        )}

        {item.isHighlighted ? (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-brand-gradient px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
            {TC.premiumBadge}
          </span>
        ) : null}

        <button
          type="button"
          aria-label={
            favorited
              ? UI_TEXT.catalog2.favoriteToggle.removeAria
              : UI_TEXT.catalog2.favoriteToggle.addAria
          }
          aria-pressed={favorited}
          title={favoriteError ?? TC.saveTooltip}
          disabled={favoritePending}
          onClick={handleFavoriteToggle}
          className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg-card/80 backdrop-blur-sm transition-colors hover:bg-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/40 ${
            favorited
              ? "text-rose-500 hover:text-rose-600"
              : "text-text-sec hover:text-rose-500"
          } ${favoritePending ? "opacity-60" : ""}`}
        >
          <Heart
            className={`h-4 w-4 ${favorited ? "fill-current" : ""}`}
            aria-hidden
          />
        </button>

        {/* Booking CTA — appears on hover over the photo */}
        <Link
          href={bookingHref}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-black/55 to-transparent pb-3 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <span className="rounded-full bg-primary px-5 py-1.5 text-xs font-semibold text-white shadow-md">
            {UI_TEXT.catalog.book}
          </span>
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          {item.avatarUrl ? (
            <FocalImage
              src={item.avatarUrl}
              alt=""
              width={36}
              height={36}
              className={
                item.type === "master"
                  ? "h-9 w-9 rounded-full object-cover ring-1 ring-border-subtle"
                  : "h-9 w-9 rounded-xl object-cover ring-1 ring-border-subtle"
              }
            />
          ) : (
            <span
              aria-hidden
              className={
                item.type === "master"
                  ? "grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-semibold text-text-sec"
                  : "grid h-9 w-9 place-items-center rounded-xl bg-muted text-xs font-semibold text-text-sec"
              }
            >
              {item.title.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-main">{item.title}</p>
            {item.tagline ? (
              <p className="truncate text-xs text-text-sec">{item.tagline}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-text-sec">
          {isNew ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {TC.newLabel}
            </span>
          ) : (
            <>
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden />
              <span className="font-semibold tabular-nums text-text-main">
                {item.ratingAvg.toFixed(1)}
              </span>
              <span className="tabular-nums">
                {TC.reviewsLabel.replace("{count}", String(item.reviewsCount))}
              </span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-semibold text-text-main">
            <span className="text-text-sec">{TC.fromPrice} </span>
            <span className="tabular-nums">{priceText}</span>
          </span>
          {slotText ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="tabular-nums">{slotText}</span>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

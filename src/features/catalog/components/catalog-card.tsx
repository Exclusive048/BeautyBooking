"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { PhotoCarousel } from "@/features/catalog/components/photo-carousel";
import { cn } from "@/lib/cn";
import { moneyRUBFromKopeks } from "@/lib/format";
import { hueFromId } from "@/lib/utils/hue-from-id";
import { ApiClientError, fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import { providerPublicUrl } from "@/lib/public-urls";
import {
  formatAvailability,
  normalizeSlotPrecision,
} from "@/features/catalog/lib/slot-precision-format";

type CatalogCardItem = {
  type: "master" | "studio";
  // QA-103: public search no longer carries the internal CUID — favorites,
  // profile link and the hue placeholder all key off publicUsername.
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
  // CATALOG-ENHANCEMENTS-A: provider's slot-presentation preference
  // surfaced by the listing query (cheap scalar). `availableToday`
  // is the same boolean snapshot the listing already exposes
  // (renamed from the implicit `todaySlotsCount > 0` signal).
  slotPrecision?: string;
  availableToday?: boolean;
  /** TZ-DISPLAY-SALON-PARITY-01: salon tz for the (dormant) `nextSlot` time. */
  timezone?: string;
  /** CATALOG-SORT-DISTANCE: расстояние до пользователя, если он поделился геопозицией. */
  distanceMeters?: number | null;
};

/** «850 м» → «0,9 км»; до 10 км — с десятой, дальше — целыми. */
function formatDistanceKm(meters: number): string {
  const km = meters / 1000;
  const value = km < 10 ? UI_FMT.decimal(km, 1) : String(Math.round(km));
  return `${value.replace(".", ",")} ${UI_TEXT.catalog2.card.distanceKm}`;
}

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
 * Hue placeholder is deterministic via `hueFromId(item.publicUsername)` — masters
 * without portfolio still get a stable, distinctive card colour across renders.
 */
export function CatalogCard({
  item,
  serviceQuery,
  initialFavorited = false,
  isAuthenticated = false,
  onLoginRequired,
}: Props) {
  const router = useRouter();
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
    // happens after. Roll back on any refusal: протухший вход — окно входа,
    // лимит — своя строка поверхности, прочее — строка сервера либо своя
    // (29.09 · 11).
    const next = !favorited;
    setFavorited(next);
    setFavoritePending(true);
    try {
      const data = await fetchJson<{ favorited: boolean }>("/api/favorites/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerUsername: item.publicUsername }),
      });
      // Reconcile with the server's view in case of a race.
      setFavorited(data.favorited);
    } catch (error) {
      setFavorited(!next);
      if (error instanceof ApiClientError && error.status === 401) {
        onLoginRequired?.();
      } else if (error instanceof ApiClientError && error.status === 429) {
        setFavoriteError(UI_TEXT.common.favoriteToggle.errorRateLimited);
      } else {
        setFavoriteError(serverMessageOr(error, UI_TEXT.common.favoriteToggle.errorGeneric));
      }
    } finally {
      setFavoritePending(false);
    }
  }
  const href = providerPublicUrl({ id: item.publicUsername ?? "", publicUsername: item.publicUsername }, "catalog-card") ?? "#";
  const bookingHref = item.publicUsername ? `/u/${item.publicUsername}/booking` : "#";

  const hasServiceQuery = serviceQuery.trim().length > 0;
  const priceText =
    hasServiceQuery && item.primaryService && item.primaryService.price > 0
      ? moneyRUBFromKopeks(item.primaryService.price)
      : item.minPrice && item.minPrice > 0
        ? moneyRUBFromKopeks(item.minPrice)
        : "—";

  // CATALOG-ENHANCEMENTS-A: availability is now precision-aware. The
  // listing today only exposes the cheap `availableToday` snapshot
  // (no per-card schedule-engine pass). The helper degrades
  // gracefully — providers preferring `"exact"` still get the
  // "Сегодня свободно" / "Запись открыта" fallback path until a
  // precomputed `nextSlot` snapshot lands (backlog).
  const availability = formatAvailability({
    precision: normalizeSlotPrecision(item.slotPrecision),
    nextSlotStartAt: item.nextSlot?.startAt ?? null,
    availableToday: item.availableToday ?? (item.todaySlotsCount ?? 0) > 0,
    // TZ-DISPLAY-SALON-PARITY-01: a slot time is a SALON-tz instant, never the
    // viewer's browser tz. `nextSlot` is null today (dormant) — this is
    // correct-when-lit. Fallback is the platform-default salon tz, not viewer.
    timeZone: item.timezone ?? "Europe/Moscow",
    fallbackToOpen: false,
  });

  const isNew = item.reviewsCount <= 0;
  const hue = hueFromId(item.publicUsername ?? item.title);
  const avatarShape = item.type === "master" ? "rounded-full" : "rounded-xl";

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={item.title}
      data-testid="catalog-card"
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        // Только когда в фокусе сама карточка: Enter на сердечке или стрелке
        // карусели всплывал сюда и уводил в профиль вместо своего действия.
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
      }}
      className="group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card transition-all duration-200 hover:border-primary/30 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/40"
    >
      {/* CATALOG-CARD-COMPACT: на телефоне кадр 16:10 — карточка в один столбец
          ниже почти на треть; с `md` ячейки у́же, там прежние 4:3. Фото —
          все публичные работы, первым идёт выбранное главное. */}
      <div className="relative">
        <PhotoCarousel
          photos={item.photos}
          alt={item.title}
          className="aspect-[16/10] md:aspect-[4/3]"
          dotsClassName="md:group-hover:opacity-0"
          placeholder={
            <div
              aria-hidden
              className="h-full w-full"
              style={{
                background: `linear-gradient(135deg, hsl(${hue} 70% 70%), hsl(${(hue + 30) % 360} 60% 55%))`,
              }}
            />
          }
        />

        {item.isHighlighted ? (
          <span className="absolute left-3 top-3 z-10 inline-flex items-center rounded-full bg-brand-gradient px-2.5 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wider text-white shadow-sm">
            {TC.premiumBadge}
          </span>
        ) : null}

        <Button
          variant="wrapper"
          size="none"
          aria-label={
            favorited
              ? UI_TEXT.common.favoriteToggle.removeAria
              : UI_TEXT.common.favoriteToggle.addAria
          }
          aria-pressed={favorited}
          title={favoriteError ?? TC.saveTooltip}
          disabled={favoritePending}
          onClick={handleFavoriteToggle}
          className={cn(
            "absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg-card/80 backdrop-blur-sm transition-colors hover:bg-bg-card focus-visible:ring-2 focus-visible:ring-primary-glow/40",
            favorited ? "text-accent-text hover:text-accent-text-hover" : "text-text-sec hover:text-accent-text",
            favoritePending && "opacity-60",
          )}
        >
          <Heart className={cn("h-4 w-4", favorited && "fill-current")} aria-hidden />
        </Button>

        {/* Кнопка записи — только мышью, при наведении на фото. Слой выше
            ленты, но пропускает свайп/клик, пока не наведён. */}
        <Link
          href={bookingHref}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden items-end justify-center bg-gradient-to-t from-black/55 to-transparent pb-3 pt-8 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 md:flex"
        >
          <span className="rounded-full bg-primary px-5 py-1.5 text-xs font-semibold text-white shadow-md">
            {UI_TEXT.catalog.book}
          </span>
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 md:gap-3 md:p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {item.avatarUrl ? (
            <ResilientImage
              src={item.avatarUrl}
              alt=""
              width={32}
              height={32}
              className={cn("h-8 w-8 shrink-0 object-cover ring-1 ring-border-subtle", avatarShape)}
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center bg-muted text-xs font-semibold text-text-sec",
                avatarShape,
              )}
            >
              {item.title.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-text-main">{item.title}</p>
              {isNew ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-3xs font-medium text-accent-text">
                  {TC.newLabel}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-sec">
                  <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                  <span className="font-semibold tabular-nums text-text-main">
                    {UI_FMT.decimal(item.ratingAvg, 1)}
                  </span>
                  <span aria-hidden>·</span>
                  {/* CATALOG-RANKING-01: число отзывов словом, не «(47)». */}
                  <span className="tabular-nums">{TC.reviewsLabel(item.reviewsCount)}</span>
                </span>
              )}
            </div>
            {item.tagline ? (
              <p className="truncate text-xs text-text-sec">{item.tagline}</p>
            ) : null}
            {typeof item.distanceMeters === "number" ? (
              <p className="inline-flex items-center gap-1 text-xs text-text-sec">
                <MapPin className="h-3 w-3" aria-hidden />
                <span className="tabular-nums">{formatDistanceKm(item.distanceMeters)}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex min-w-0 items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text-main">
            <span className="text-text-sec">{TC.fromPrice} </span>
            <span className="tabular-nums">{priceText}</span>
          </span>
          {availability.label ? (
            <span
              className={
                availability.tone === "available"
                  ? "inline-flex items-center gap-1.5 text-xs text-success-text"
                  : "inline-flex items-center gap-1.5 text-xs text-text-sec"
              }
            >
              <span
                aria-hidden
                className={
                  availability.tone === "available"
                    ? "h-1.5 w-1.5 rounded-full bg-success"
                    : "h-1.5 w-1.5 rounded-full bg-text-sec/40"
                }
              />
              <span className="tabular-nums">{availability.label}</span>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

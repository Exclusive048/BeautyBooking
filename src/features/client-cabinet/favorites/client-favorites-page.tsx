"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ChevronRight,
  Crown,
  Eye,
  Heart,
  Home,
  MapPin,
  Star,
  User,
} from "lucide-react";
import { PRESS } from "@/components/ui/motion-classes";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { ResilientImage } from "@/components/ui/resilient-image";
import { moneyRUBFromKopeks } from "@/lib/format";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  FavoriteCardDTO,
  FavoritesEnrichedPayload,
} from "@/lib/client-cabinet/favorites.service";
import {
  formatLastVisit,
  formatMastersLabel,
  formatVisitsLabel,
  sortFavorites,
  type SortOption,
} from "./lib/format-helpers";

const T = UI_TEXT.clientCabinet.favorites;

type TabKey = "masters" | "studios";

const fetcher = (url: string) =>
  fetchJsonWithAuth<FavoritesEnrichedPayload>(url);

export function ClientFavoritesPage() {
  const toast = useToast();
  const { data, mutate, isLoading, error } = useSWR<FavoritesEnrichedPayload>(
    "/api/cabinet/user/favorites",
    fetcher,
  );

  const [tab, setTab] = useState<TabKey>("masters");
  const [sort, setSort] = useState<SortOption>("recent");

  const masters = useMemo(() => data?.masters ?? [], [data]);
  const studios = useMemo(() => data?.studios ?? [], [data]);
  const items = tab === "masters" ? masters : studios;
  const sorted = useMemo(() => sortFavorites(items, sort), [items, sort]);

  async function handleUnfavorite(providerId: string) {
    const previousMasters = masters;
    const previousStudios = studios;

    // Optimistic remove
    await mutate(
      {
        masters: masters.filter((m) => m.providerId !== providerId),
        studios: studios.filter((s) => s.providerId !== providerId),
      },
      false,
    );

    try {
      await fetchJsonWithAuth<unknown>("/api/favorites/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      await mutate();
    } catch (error) {
      // Откат — и слово о нём (29.09 · 11): карточка вернулась не просто так.
      toast.error(serverMessageOr(error, T.removeFailed));
      await mutate(
        { masters: previousMasters, studios: previousStudios },
        false,
      );
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl text-text-main lg:text-4xl">
          {T.title}
        </h1>
        <p className="mt-1 text-sm text-text-sec">
          {T.descriptionTemplate.replace(
            "{count}",
            String(masters.length + studios.length),
          )}
        </p>
      </header>

      <FavoritesTabs
        tab={tab}
        onChange={setTab}
        mastersCount={masters.length}
        studiosCount={studios.length}
      />

      <FavoritesSortBar count={sorted.length} sort={sort} onChange={setSort} />

      {error ? (
        <Card className="p-6 text-center text-sm text-text-sec">
          {UI_TEXT.common.blockLoadFailed}
        </Card>
      ) : isLoading ? (
        <FavoritesGridSkeleton />
      ) : sorted.length === 0 ? (
        <FavoritesEmptyState tab={tab} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((item) =>
            tab === "masters" ? (
              <FavMasterCard
                key={item.providerId}
                data={item}
                onUnfavorite={() => handleUnfavorite(item.providerId)}
              />
            ) : (
              <FavStudioCard
                key={item.providerId}
                data={item}
                onUnfavorite={() => handleUnfavorite(item.providerId)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FavoritesTabs({
  tab,
  onChange,
  mastersCount,
  studiosCount,
}: {
  tab: TabKey;
  onChange: (t: TabKey) => void;
  mastersCount: number;
  studiosCount: number;
}) {
  return (
    <SegmentedTabs<TabKey>
      value={tab}
      onChange={onChange}
      ariaLabel={T.tabsAria}
      className="w-full sm:w-80"
      options={[
        { value: "masters", label: T.tabMasters, icon: <User className="h-4 w-4" aria-hidden />, badge: mastersCount },
        { value: "studios", label: T.tabStudios, icon: <Home className="h-4 w-4" aria-hidden />, badge: studiosCount },
      ]}
    />
  );
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "recent", label: T.sortRecent },
  { value: "rating", label: T.sortRating },
  { value: "visits", label: T.sortVisits },
];

function FavoritesSortBar({
  count,
  sort,
  onChange,
}: {
  count: number;
  sort: SortOption;
  onChange: (s: SortOption) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-sm text-text-sec">{T.countLabel(count)}</div>
      <SegmentedTabs<SortOption>
        value={sort}
        onChange={onChange}
        ariaLabel={T.sortAria}
        className="ml-auto w-full sm:w-auto"
        options={SORT_OPTIONS}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FavMasterCard({
  data,
  onUnfavorite,
}: {
  data: FavoriteCardDTO;
  onUnfavorite: () => void;
}) {
  const bookingHref = data.publicUsername
    ? `/u/${data.publicUsername}/booking`
    : "/catalog";
  const profileHref = data.publicUsername ? `/u/${data.publicUsername}` : "/catalog";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card transition hover:shadow-card">
      <PhotoBlock photoUrl={data.photoUrl} hue={data.hue} label={data.tagline} kind="master" />

      <UnfavoriteButton onClick={onUnfavorite} />
      {data.isPremium ? <PremiumBadge /> : null}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="truncate font-display text-base font-semibold text-text-main">
            {data.name}
          </h3>
          {data.tagline ? (
            <p className="truncate text-xs text-text-sec">{data.tagline}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Star className="h-3.5 w-3.5 fill-primary text-accent-text" aria-hidden />
          <span className="font-mono font-semibold text-text-main">
            {data.rating > 0 ? data.rating.toFixed(1) : "—"}
          </span>
          {data.reviewsCount > 0 ? (
            <span className="text-text-sec">({data.reviewsCount})</span>
          ) : null}
          <span className="text-text-sec">·</span>
          <span className="text-text-sec">
            {data.visitsCount > 0
              ? formatVisitsLabel(data.visitsCount)
              : "Ещё не были"}
          </span>
        </div>

        {data.lastVisitIso ? (
          <div className="text-xs text-text-sec">
            Последний визит: {formatLastVisit(data.lastVisitIso)}
          </div>
        ) : null}

        <div className="mt-auto flex gap-1.5 pt-2">
          <Link href={bookingHref} className="flex-1">
            <Button variant="primary" size="sm" className="w-full">
              {data.startingPrice
                ? `Записаться · ${moneyRUBFromKopeks(data.startingPrice)}`
                : "Записаться"}
            </Button>
          </Link>
          <Link href={profileHref}>
            <Button variant="secondary" size="icon" aria-label={T.openProfileAria} className="h-9 w-auto px-3">
              <Eye className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

function FavStudioCard({
  data,
  onUnfavorite,
}: {
  data: FavoriteCardDTO;
  onUnfavorite: () => void;
}) {
  const profileHref = data.publicUsername ? `/u/${data.publicUsername}` : "/catalog";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card transition hover:shadow-card">
      <PhotoBlock photoUrl={data.photoUrl} hue={data.hue} label={data.name} kind="studio" />

      <UnfavoriteButton onClick={onUnfavorite} />
      {data.isPremium ? <PremiumBadge /> : null}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="truncate font-display text-base font-semibold text-text-main">
            {data.name}
          </h3>
          {data.tagline ? (
            <p className="truncate text-xs text-text-sec">{data.tagline}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Star className="h-3.5 w-3.5 fill-primary text-accent-text" aria-hidden />
          <span className="font-mono font-semibold text-text-main">
            {data.rating > 0 ? data.rating.toFixed(1) : "—"}
          </span>
          {data.reviewsCount > 0 ? (
            <span className="text-text-sec">({data.reviewsCount})</span>
          ) : null}
          <span className="text-text-sec">·</span>
          <span className="text-text-sec">
            {formatMastersLabel(data.mastersCount ?? 0)}
          </span>
        </div>

        {data.address ? (
          <div className="flex items-center gap-1.5 text-xs text-text-sec">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{data.address}</span>
          </div>
        ) : null}

        <div className="mt-auto flex gap-1.5 pt-2">
          <Link href={profileHref} className="flex-1">
            <Button variant="primary" size="sm" className="w-full">
              Выбрать мастера
            </Button>
          </Link>
          <Link href={profileHref}>
            <Button variant="secondary" size="icon" aria-label={T.aboutStudioAria} className="h-9 w-auto px-3">
              <Eye className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * FAVORITES-PHOTO-FIT (2026-09-25): фото карточки — в пропорции, а не в полосе
 * `h-40` на всю ширину. У мастера это первое фото портфолио (почти всегда
 * вертикальное, с телефона), у студии — аватар (квадратный вырез): в полосе
 * ~2.2:1 от первого оставалась треть кадра, от второго — половина логотипа.
 * Отсюда и пропорции: 4:5 для работы мастера, квадрат для аватара студии.
 * Картинка заполняет бокс (`fill` + `sizes` по сетке), а не запрашивается
 * фиксированными 400×160 — на широкой карточке это было ещё и мыло.
 */
const PHOTO_BOX_CLASS: Record<"master" | "studio", string> = {
  master: "aspect-[4/5]",
  studio: "aspect-square",
};

function PhotoBlock({
  photoUrl,
  hue,
  label,
  kind,
}: {
  photoUrl: string | null;
  hue: number;
  label: string | null;
  kind: "master" | "studio";
}) {
  if (photoUrl) {
    return (
      <div className={`relative w-full overflow-hidden bg-bg-input ${PHOTO_BOX_CLASS[kind]}`}>
        <ResilientImage
          src={photoUrl}
          alt={label ?? ""}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={`relative flex w-full items-center justify-center ${PHOTO_BOX_CLASS[kind]}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 60%, 92%), hsl(${hue}, 50%, 78%))`,
      }}
    >
      {label ? (
        <span className="rounded-md bg-white/60 px-3 py-1 text-sm font-medium text-text-main/80">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function UnfavoriteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="wrapper"
      onClick={onClick}
      aria-label={T.removeFromFavoritesAria}
      className={`absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-bg-card/95 text-accent-text shadow-card backdrop-blur transition ${PRESS}`}
    >
      <Heart className="h-4 w-4 fill-current" aria-hidden />
    </Button>
  );
}

function PremiumBadge() {
  return (
    <div className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 font-mono text-3xs uppercase tracking-[0.18em] text-white">
      <Crown className="h-3 w-3" aria-hidden />
      PREMIUM
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FavoritesEmptyState({ tab }: { tab: TabKey }) {
  const label = tab === "masters" ? "мастеров" : "студии";
  return (
    <Card className="flex flex-col items-center gap-4 p-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-bg-input">
        <Heart className="h-7 w-7 text-text-sec" aria-hidden />
      </div>
      <div>
        <div className="font-display text-base text-text-main">{T.empty.title}</div>
        <p className="mt-1 text-sm text-text-sec">
          Добавляйте {label} в избранное, чтобы быстро записываться.
        </p>
      </div>
      <Link href="/catalog">
        <Button size="sm" variant="secondary">
          {T.empty.cta}
          <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Button>
      </Link>
    </Card>
  );
}

function FavoritesGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="h-72 animate-pulse bg-bg-input/40" />
      ))}
    </div>
  );
}

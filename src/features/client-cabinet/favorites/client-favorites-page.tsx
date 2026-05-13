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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FocalImage } from "@/components/ui/focal-image";
import { moneyRUB } from "@/lib/format";
import { UI_TEXT } from "@/lib/ui/text";
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
  fetch(url, { credentials: "include" }).then(async (res) => {
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "load_failed");
    return json.data as FavoritesEnrichedPayload;
  });

export function ClientFavoritesPage() {
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
      const res = await fetch("/api/favorites/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      if (!res.ok) throw new Error("toggle_failed");
      await mutate();
    } catch {
      // Rollback to previous state
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
    <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-border-subtle bg-bg-card p-1">
      <TabButton
        active={tab === "masters"}
        onClick={() => onChange("masters")}
        icon={User}
        label="Мастера"
        count={mastersCount}
      />
      <TabButton
        active={tab === "studios"}
        onClick={() => onChange("studios")}
        icon={Home}
        label="Студии"
        count={studiosCount}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof User;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
        active
          ? "bg-brand-gradient text-white"
          : "text-text-sec hover:text-text-main"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] ${
          active ? "bg-white/25 text-white" : "bg-bg-input text-text-sec"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "recent", label: "Сначала недавние" },
  { value: "rating", label: "По рейтингу" },
  { value: "visits", label: "По числу визитов" },
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
      <div className="text-sm text-text-sec">{count} в избранном</div>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {SORT_OPTIONS.map((opt) => {
          const active = opt.value === sort;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-primary/40 bg-bg-input text-primary"
                  : "border-border-subtle bg-bg-card text-text-sec hover:border-border-subtle/80"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
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
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card transition hover:shadow-card">
      <PhotoBlock photoUrl={data.photoUrl} hue={data.hue} label={data.tagline} />

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
          <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
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
                ? `Записаться · ${moneyRUB(data.startingPrice)}`
                : "Записаться"}
            </Button>
          </Link>
          <Link href={profileHref}>
            <Button variant="secondary" size="sm" aria-label="Открыть профиль">
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
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card transition hover:shadow-card">
      <PhotoBlock photoUrl={data.photoUrl} hue={data.hue} label={data.name} />

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
          <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
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
            <Button variant="secondary" size="sm" aria-label="О студии">
              <Eye className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function PhotoBlock({
  photoUrl,
  hue,
  label,
}: {
  photoUrl: string | null;
  hue: number;
  label: string | null;
}) {
  if (photoUrl) {
    return (
      <div className="relative h-40 w-full overflow-hidden">
        <FocalImage
          src={photoUrl}
          alt={label ?? ""}
          width={400}
          height={160}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="relative flex h-40 w-full items-center justify-center"
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
    <button
      type="button"
      onClick={onClick}
      aria-label="Убрать из избранного"
      className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-bg-card/95 text-primary shadow-card backdrop-blur transition hover:scale-105"
    >
      <Heart className="h-4 w-4 fill-current" aria-hidden />
    </button>
  );
}

function PremiumBadge() {
  return (
    <div className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white">
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

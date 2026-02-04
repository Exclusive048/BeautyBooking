"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  provider: ProviderProfileDto;
  coverUrl: string | null;
  specialization?: string | null;
  showFavoriteButton?: boolean;
};

export function HeroBlock({ provider, coverUrl, specialization, showFavoriteButton = false }: Props) {
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: provider.name, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShareMessage(UI_TEXT.publicProfile.hero.shareSuccess);
      window.setTimeout(() => setShareMessage(null), 2000);
    } catch {
      setShareMessage(UI_TEXT.publicProfile.hero.shareFailed);
      window.setTimeout(() => setShareMessage(null), 2000);
    }
  }

  const mapsHref = buildYandexMapsUrl({
    address: provider.address,
    lat: provider.geoLat,
    lon: provider.geoLng,
  });

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-neutral-900 shadow-lg">
      <div className="relative h-64 md:h-72">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            aria-label={UI_TEXT.publicProfile.hero.share}
            className="rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-white backdrop-blur hover:bg-black/60"
          >
            {UI_TEXT.publicProfile.hero.share}
          </button>
          {showFavoriteButton ? (
            <button
              type="button"
              aria-label={UI_TEXT.publicProfile.hero.favorite}
              className="rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-white backdrop-blur hover:bg-black/60"
            >
              {UI_TEXT.publicProfile.hero.favorite}
            </button>
          ) : null}
        </div>

        <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-end gap-4">
              {provider.avatarUrl ? (
                <img
                  src={provider.avatarUrl}
                  alt={provider.name}
                  className="h-24 w-24 rounded-2xl border border-white/20 object-cover md:h-28 md:w-28"
                />
              ) : (
                <div className="h-24 w-24 rounded-2xl border border-white/20 bg-white/10 md:h-28 md:w-28" />
              )}

              <div className="pb-1 text-white">
                <h1 className="text-2xl font-semibold md:text-3xl">{provider.name}</h1>
                {specialization ? <div className="mt-1 text-sm text-white/80">{specialization}</div> : null}
                <div className="mt-2 text-sm">{UI_FMT.ratingLabel(provider.rating, provider.reviews)}</div>
              </div>
            </div>

            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                aria-label={`${UI_TEXT.publicProfile.hero.address}: ${provider.address}`}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-white backdrop-blur hover:bg-black/60"
              >
                <span aria-hidden>📍</span>
                <span>{provider.address}</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {shareMessage ? (
        <div className="border-t border-white/10 px-4 py-2 text-xs text-neutral-300 md:px-6">{shareMessage}</div>
      ) : null}
    </section>
  );
}

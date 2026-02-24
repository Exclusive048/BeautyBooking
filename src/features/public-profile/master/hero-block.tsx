"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { HotSlotsSubscribeButton } from "@/features/hot-slots/components/hot-slots-subscribe-button";

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
    <section className="relative overflow-hidden rounded-[32px] border border-border-subtle/70 bg-bg-card shadow-hover">
      <div className="relative h-[280px] md:h-[340px]">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-bg-card via-bg-input to-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
        <div className="pointer-events-none absolute -left-16 -top-20 h-60 w-60 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 top-8 h-56 w-56 rounded-full bg-primary-magenta/18 blur-3xl" />

        <div className="absolute right-4 top-4 flex items-center gap-2">
          <HotSlotsSubscribeButton
            providerId={provider.id}
            enabled={provider.type === "MASTER" && provider.hotSlotsEnabled}
          />
          <button
            type="button"
            onClick={onShare}
            aria-label={UI_TEXT.publicProfile.hero.share}
            className="frost-panel rounded-xl px-3 py-2 text-sm text-white transition hover:bg-black/55"
          >
            {UI_TEXT.publicProfile.hero.share}
          </button>
          {showFavoriteButton ? (
            <button
              type="button"
              aria-label={UI_TEXT.publicProfile.hero.favorite}
              className="frost-panel rounded-xl px-3 py-2 text-sm text-white transition hover:bg-black/55"
            >
              {UI_TEXT.publicProfile.hero.favorite}
            </button>
          ) : null}
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 md:px-6 md:pb-6">
          <div className="frost-panel rounded-2xl p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex items-end gap-4">
                {provider.avatarUrl ? (
                  <img
                    src={provider.avatarUrl}
                    alt={provider.name}
                    className="h-[120px] w-[120px] rounded-full border-4 border-white/65 object-cover shadow-card"
                  />
                ) : (
                  <div className="h-[120px] w-[120px] rounded-full border-4 border-white/55 bg-white/20" />
                )}

                <div className="pb-1 text-white">
                  <h1 className="text-2xl font-semibold md:text-3xl">{provider.name}</h1>
                  {specialization ? <div className="mt-1 text-sm text-white/85">{specialization}</div> : null}
                  <div className="mt-2 text-sm">{UI_FMT.ratingLabel(provider.rating, provider.reviews)}</div>
                  {provider.superpowerBadges.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {provider.superpowerBadges.map((badge) => (
                        <span
                          key={badge.code}
                          className="rounded-full border border-white/35 bg-black/25 px-2 py-1 text-[11px] text-white"
                          title={`${badge.subtitle} · ${badge.count}`}
                        >
                          {badge.icon} {badge.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${UI_TEXT.publicProfile.hero.address}: ${provider.address}`}
                  className="frost-panel inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white transition hover:bg-black/55"
                >
                  <span aria-hidden>📍</span>
                  <span>{provider.address}</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {shareMessage ? (
        <div className="border-t border-border-subtle/70 px-4 py-2 text-xs text-text-sec md:px-6">
          {shareMessage}
        </div>
      ) : null}
    </section>
  );
}

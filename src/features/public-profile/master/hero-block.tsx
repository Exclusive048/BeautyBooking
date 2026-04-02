"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { HotSlotsSubscribeButton } from "@/features/hot-slots/components/hot-slots-subscribe-button";
import { FocalImage } from "@/components/ui/focal-image";

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
          <FocalImage src={coverUrl} alt="" className="h-full w-full object-cover" />
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
          <Button
            onClick={onShare}
            aria-label={UI_TEXT.publicProfile.hero.share}
            variant="ghost"
            size="sm"
            className="frost-panel text-white hover:bg-black/55"
          >
            {UI_TEXT.publicProfile.hero.share}
          </Button>
          {showFavoriteButton ? (
            <Button
              aria-label={UI_TEXT.publicProfile.hero.favorite}
              variant="ghost"
              size="sm"
              className="frost-panel text-white hover:bg-black/55"
            >
              {UI_TEXT.publicProfile.hero.favorite}
            </Button>
          ) : null}
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 md:px-6 md:pb-6">
          <div className="frost-panel rounded-2xl p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex items-end gap-4">
                <motion.div
                  initial={{ scale: 0.88, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
                >
                  {provider.avatarUrl ? (
                    <FocalImage
                      src={provider.avatarUrl}
                      alt={provider.name}
                      focalX={provider.avatarFocalX}
                      focalY={provider.avatarFocalY}
                      className="h-[120px] w-[120px] rounded-full border-4 border-white/65 object-cover shadow-card"
                    />
                  ) : (
                    <div className="h-[120px] w-[120px] rounded-full border-4 border-white/55 bg-white/20" />
                  )}
                </motion.div>

                <div className="pb-1 text-white">
                  <motion.h1
                    className="text-2xl font-semibold md:text-3xl"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
                  >
                    {provider.name}
                  </motion.h1>
                  {specialization ? (
                    <motion.div
                      className="mt-1 text-sm text-white/85"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.18, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
                    >
                      {specialization}
                    </motion.div>
                  ) : null}
                  <motion.div
                    className="mt-2 text-sm"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.24, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
                  >
                    {UI_FMT.ratingLabel(provider.rating, provider.reviews)}
                  </motion.div>
                  {provider.superpowerBadges.length > 0 ? (
                    <motion.div
                      className="mt-2 flex flex-wrap gap-1.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      {provider.superpowerBadges.map((badge) => (
                        <span
                          key={badge.code}
                          className="rounded-full border border-white/35 bg-black/25 px-2 py-1 text-[11px] text-white"
                          title={`${badge.subtitle} · ${badge.count}`}
                        >
                          {badge.icon} {badge.title}
                        </span>
                      ))}
                    </motion.div>
                  ) : null}
                </div>
              </div>

              {mapsHref ? (
                <motion.a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${UI_TEXT.publicProfile.hero.address}: ${provider.address}`}
                  className="frost-panel inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white transition hover:bg-black/55"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.32, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
                >
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{provider.address}</span>
                </motion.a>
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

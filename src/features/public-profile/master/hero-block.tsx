"use client";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Share2, Star } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { FocalImage } from "@/components/ui/focal-image";
import { Button } from "@/components/ui/button";
import { FavoriteToggleButton } from "@/components/ui/favorite-toggle-button";
import { HotSlotsSubscribeButton } from "@/features/hot-slots/components/hot-slots-subscribe-button";
import { AvailabilityHint } from "@/features/public-profile/master/components/availability-hint";
import { PremiumRing } from "@/features/public-profile/master/components/premium-ring";
import type {
  AvailabilityHint as AvailabilityHintData,
  MasterPublicProfileView,
} from "@/lib/master/public-profile-view.service";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  view: MasterPublicProfileView;
  isAuthenticated?: boolean;
  initialFavorited?: boolean;
};

const T = UI_TEXT.publicProfile.hero;

function pluralizeYear(n: number): string {
  const rules = new Intl.PluralRules("ru-RU");
  const form = rules.select(n);
  if (form === "one") return T.yearUnitOne;
  if (form === "few") return T.yearUnitFew;
  return T.yearUnitMany;
}

function formatExperience(months: number | null): string | null {
  if (months === null) return null;
  if (months < 12) {
    return T.experienceTemplate.replace(
      "{value}",
      T.experienceMonthsTemplate.replace("{count}", String(Math.max(1, months))),
    );
  }
  const years = Math.floor(months / 12);
  return T.experienceTemplate.replace(
    "{value}",
    T.experienceYearsTemplate
      .replace("{count}", String(years))
      .replace("{unit}", pluralizeYear(years)),
  );
}

export function HeroBlock({ view, isAuthenticated = false, initialFavorited = false }: Props) {
  const { provider, planTier, experienceMonths, availability } = view;
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const isPremium = planTier === "PREMIUM";
  const mapsHref = buildYandexMapsUrl({
    address: provider.address,
    lat: provider.geoLat,
    lon: provider.geoLng,
  });
  const experienceLabel = formatExperience(experienceMonths);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = { title: provider.name, url };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShareMessage(T.shareSuccess);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage(T.shareSuccess);
      } catch {
        setShareMessage(T.shareFailed);
      }
    }
    window.setTimeout(() => setShareMessage(null), 2200);
  }

  return (
    <section className="aurora-bg relative overflow-hidden rounded-[28px] border border-border-subtle/70 bg-bg-card">
      <div className="relative px-5 py-6 md:px-8 md:py-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex items-center gap-1.5 text-xs text-text-sec"
        >
          <Link href="/catalog" className="transition hover:text-text-main">
            {T.breadcrumbCatalog}
          </Link>
          <ChevronRight className="h-3 w-3 opacity-50" aria-hidden />
          <span className="text-text-main">{provider.name}</span>
        </nav>

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0"
          >
            <PremiumRing active={isPremium}>
              {provider.avatarUrl ? (
                <FocalImage
                  src={provider.avatarUrl}
                  alt={provider.name}
                  width={132}
                  height={132}
                  priority
                  className="h-[120px] w-[120px] rounded-full object-cover md:h-[132px] md:w-[132px]"
                />
              ) : (
                <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-bg-input text-3xl text-text-sec md:h-[132px] md:w-[132px]">
                  {provider.name.charAt(0).toUpperCase()}
                </div>
              )}
            </PremiumRing>
          </motion.div>

          <div className="min-w-0 flex-1">
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-3xl leading-tight text-text-main md:text-[40px]"
            >
              {provider.name}
            </motion.h1>

            {(provider.tagline || experienceLabel) && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="mt-2 flex flex-wrap items-center gap-x-2 text-base text-text-sec"
              >
                {provider.tagline ? <span>{provider.tagline}</span> : null}
                {provider.tagline && experienceLabel ? (
                  <span aria-hidden className="text-text-sec/40">
                    ·
                  </span>
                ) : null}
                {experienceLabel ? <span>{experienceLabel}</span> : null}
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
            >
              <span className="inline-flex items-center gap-1.5 text-text-main">
                <Star
                  className="h-4 w-4 fill-amber-500 text-amber-500"
                  aria-hidden
                  strokeWidth={1.5}
                />
                <strong className="font-semibold">{provider.rating.toFixed(1)}</strong>
                <span className="text-text-sec">· {provider.reviews}</span>
              </span>

              {provider.address ? (
                <a
                  href={mapsHref ?? "#"}
                  target={mapsHref ? "_blank" : undefined}
                  rel={mapsHref ? "noreferrer" : undefined}
                  className="inline-flex items-center gap-1.5 text-text-sec transition hover:text-text-main"
                >
                  <MapPin className="h-4 w-4" aria-hidden strokeWidth={1.6} />
                  <span>{provider.address}</span>
                </a>
              ) : null}

              <AvailabilityHintWrapper
                hint={availability}
                timezone={provider.timezone}
              />
            </motion.div>

            {provider.categories.length > 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                className="mt-4 flex flex-wrap gap-1.5"
              >
                {provider.categories.slice(0, 6).map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-border-subtle bg-bg-card px-2.5 py-1 text-xs text-text-main"
                  >
                    {category}
                  </span>
                ))}
              </motion.div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 self-start">
            <HotSlotsSubscribeButton
              providerId={provider.id}
              enabled={provider.hotSlotsEnabled}
            />
            <FavoriteToggleButton
              providerId={provider.id}
              initialFavorited={initialFavorited}
              isAuthenticated={isAuthenticated}
              variant="floating"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              aria-label={T.share}
              className="gap-1.5"
            >
              <Share2 className="h-4 w-4" aria-hidden strokeWidth={1.6} />
              <span className="hidden sm:inline">{T.share}</span>
            </Button>
          </div>
        </div>
      </div>

      {shareMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="border-t border-border-subtle/70 px-5 py-2 text-xs text-text-sec md:px-8"
        >
          {shareMessage}
        </div>
      ) : null}
    </section>
  );
}

function AvailabilityHintWrapper({
  hint,
  timezone,
}: {
  hint: AvailabilityHintData;
  timezone: string;
}) {
  return <AvailabilityHint hint={hint} timezone={timezone} />;
}

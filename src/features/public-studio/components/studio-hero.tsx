import { MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoOnBlur } from "@/components/ui/photo-on-blur";
import { ProviderSocialLinks } from "@/components/ui/provider-social-links";
import { ResilientImage } from "@/components/ui/resilient-image";
import { ClampedDescription } from "@/features/public-studio/components/clamped-description";
import { StudioPortfolioStrip } from "@/features/public-studio/components/studio-portfolio-strip";
import type { StudioPagePhoto } from "@/features/public-studio/server/studio-query";
import { StudioBookingLink } from "@/features/public-studio/studio-booking-dialog";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.publicStudio.hero;

/** Якорь секции отзывов на странице студии — на него ведёт «N отзывов» в шапке. */
export const STUDIO_REVIEWS_ANCHOR = "studio-reviews";

type Props = {
  studio: ProviderProfileDto;
  /** Фото страницы студии; баннер помечен `isBanner` и в карусель не попадает. */
  photos: StudioPagePhoto[];
  bookingHref: string;
  /** FIX-STUDIO-02 (owner parity): владельцу кнопку записи не показываем. */
  hideBooking?: boolean;
};

/**
 * Шапка страницы студии — STUDIO-HERO-INFO (решение владельца 2026-10-14).
 *
 * Баннер 16:9 остаётся на своём месте; справа от него (на телефоне — под ним)
 * всё, что раньше лежало отдельной карточкой внизу страницы: логотип,
 * название, слоган, оценка с числом отзывов, цена «от», адрес, описание,
 * категории услуг, ссылки на соцсети и запись. Под баннером и описанием —
 * карусель работ (`StudioPortfolioStrip`); крупная сетка «Фотографии студии»
 * ниже на странице остаётся.
 *
 * PORTFOLIO-CROP-01: в кадре — вырез баннера 16:9, выбранный админом. Без
 * баннера — первая работа целиком на размытой копии себя.
 */
export function StudioHero({ studio, photos, bookingHref, hideBooking }: Props) {
  const works = photos.filter((photo) => !photo.isBanner);
  const firstWork = works[0] ?? null;
  const mapsHref = buildYandexMapsUrl({
    address: studio.address,
    lat: studio.geoLat ?? null,
    lon: studio.geoLng ?? null,
  });
  const description = studio.description?.trim() ?? "";
  const tagline = studio.tagline.trim();

  return (
    <section className="overflow-hidden rounded-3xl border border-border-subtle bg-bg-card shadow-card">
      <div className="grid gap-2 p-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-4">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-bg-input lg:self-start">
          {studio.bannerDisplayUrl ? (
            <ResilientImage
              src={studio.bannerDisplayUrl}
              alt={studio.name}
              sizes="(max-width: 1024px) 100vw, 60vw"
              priority
              className="object-cover"
            />
          ) : firstWork ? (
            <PhotoOnBlur src={firstWork.url} alt={studio.name} sizes="(max-width: 1024px) 100vw, 60vw" priority />
          ) : (
            <>
              {/* dark-ok: подложка героя без фото — всегда тёмная, как фото под белым текстом */}
              <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700" />
              <div className="absolute left-4 top-4 rounded-lg bg-black/45 px-3 py-1 text-xs text-white/80">
                {UI_TEXT.publicStudio.galleryFallback}
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 px-3 pb-3 pt-2 lg:py-3 lg:pl-0 lg:pr-4">
          <div className="flex items-start gap-3">
            {studio.avatarUrl ? (
              <ResilientImage
                src={studio.avatarUrl}
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-2xl border border-border-subtle object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <h1 className="break-words font-display text-2xl leading-tight text-text-main md:text-3xl">
                {studio.name}
              </h1>
              {tagline ? <p className="mt-1 text-sm text-text-sec">{tagline}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {studio.reviews > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-text-main">
                <Star className="h-4 w-4 fill-rating text-rating" aria-hidden strokeWidth={1.5} />
                <strong className="font-semibold">{UI_FMT.decimal(studio.rating, 1)}</strong>
                <a
                  href={`#${STUDIO_REVIEWS_ANCHOR}`}
                  className="text-text-sec underline-offset-2 transition-colors hover:text-text-main hover:underline"
                >
                  {T.reviewsLink(studio.reviews)}
                </a>
              </span>
            ) : (
              <span className="text-text-sec">{T.noReviewsYet}</span>
            )}
            {studio.priceFrom > 0 ? (
              <span className="font-medium text-text-main">{T.priceFrom(UI_FMT.priceLabel(studio.priceFrom))}</span>
            ) : null}
            {studio.availableToday ? (
              <Badge variant="success" size="xs">
                {UI_TEXT.publicStudio.availableToday}
              </Badge>
            ) : null}
          </div>

          {studio.address ? (
            mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-2 text-sm text-text-sec transition-colors hover:text-text-main"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden strokeWidth={1.6} />
                <span className="underline underline-offset-2">{studio.address}</span>
              </a>
            ) : (
              <p className="inline-flex items-start gap-2 text-sm text-text-sec">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden strokeWidth={1.6} />
                <span>{studio.address}</span>
              </p>
            )
          ) : null}

          {description ? <ClampedDescription text={description} /> : null}

          {studio.categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {studio.categories.slice(0, 8).map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-border-subtle bg-bg-card px-2.5 py-1 text-xs text-text-main"
                >
                  {category}
                </span>
              ))}
            </div>
          ) : null}

          {/* FEAT-PROVIDER-SOCIALS / SOCIAL-TG-MAX: только заполненные ссылки. */}
          <ProviderSocialLinks
            links={{
              vk: studio.socialVk,
              instagram: studio.socialInstagram,
              telegram: studio.socialTelegram,
              max: studio.socialMax,
            }}
          />

          {hideBooking ? null : (
            // BOOKING-WIDGET-DIALOG: окно записи с первого шага; ссылки с
            // `?serviceId=` / `?master=` открывают его сами (StudioBookingAutoOpen).
            <div className="mt-auto pt-1">
              <Button asChild className="w-full sm:w-auto">
                <StudioBookingLink href={bookingHref}>{UI_TEXT.publicStudio.heroBook}</StudioBookingLink>
              </Button>
            </div>
          )}
        </div>
      </div>

      {works.length > 0 ? (
        <StudioPortfolioStrip photos={works.map(({ url, alt, caption }) => ({ url, alt, caption }))} />
      ) : null}
    </section>
  );
}

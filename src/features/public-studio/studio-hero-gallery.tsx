"use client";
import { MapPin } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { PhotoOnBlur } from "@/components/ui/photo-on-blur";
import { StudioBookingLink } from "@/features/public-studio/studio-booking-dialog";

type StudioHeroData = {
  name: string;
  rating: number;
  reviews: number;
  address: string;
  geoLat?: number | null;
  geoLng?: number | null;
};

type HeroImageItem = {
  /** Ссылка для показа: у баннера — вырез 16:9, у работы — вырез 4:5. */
  url: string;
  kind: "banner" | "work";
};

type Props = {
  studio: StudioHeroData;
  imageItems: HeroImageItem[];
  bookingHref: string;
  /** FIX-STUDIO-02 (owner parity): suppress the hero booking CTA for the owner. */
  hideBooking?: boolean;
};

/**
 * Шапка страницы студии. PORTFOLIO-CROP-01 (2026-10-13, «чтобы точно
 * отображалось то, что задумал админ»): плитки — в формате того, что в них
 * показано, поэтому кадр не обрезается второй раз.
 *
 * Главная плитка — 16:9, формат обрезки баннера: баннер встаёт целиком. Без
 * баннера в ней первая работа (4:5) — целиком, на размытом фоне. Справа на ПК —
 * четыре работы 4:5: доля колонок 20 : 9 даёт ячейкам 2×2 высоту главной плитки
 * и пропорцию ≈ 4:5; на телефоне — ряд из четырёх 4:5 под баннером.
 * Название, рейтинг и запись — под фото: плашка поверх закрывала треть баннера.
 */
export function StudioHeroGallery({ studio, imageItems, bookingHref, hideBooking }: Props) {
  const mapsHref = buildYandexMapsUrl({
    address: studio.address,
    lat: studio.geoLat ?? null,
    lon: studio.geoLng ?? null,
  });

  const heroImages = imageItems.slice(0, 5);
  const primary = heroImages[0] ?? null;
  const secondary = heroImages.slice(1);

  return (
    <section className="overflow-hidden rounded-3xl border border-border-subtle bg-bg-card shadow-card">
      <div className="grid gap-2 p-2 md:grid-cols-[20fr_9fr]">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-bg-input">
          {primary ? (
            primary.kind === "banner" ? (
              <ResilientImage
                src={primary.url}
                alt={studio.name}
                sizes="(max-width: 768px) 100vw, 66vw"
                priority
                className="object-cover"
              />
            ) : (
              <PhotoOnBlur src={primary.url} alt={studio.name} sizes="(max-width: 768px) 100vw, 66vw" priority />
            )
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

        <div
          className={cn(
            "grid grid-cols-4 gap-2 md:grid-cols-2 md:grid-rows-2",
            secondary.length === 0 && "hidden md:grid",
          )}
        >
          {Array.from({ length: 4 }).map((_, index) => {
            const item = secondary[index] ?? null;
            return (
              <div
                key={index}
                className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-bg-input/35 md:aspect-auto md:h-full"
              >
                {item ? (
                  <ResilientImage
                    src={item.url}
                    alt=""
                    sizes="(max-width: 768px) 25vw, 17vw"
                    className="object-cover"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-2 md:flex-row md:items-end md:justify-between md:px-6 md:pb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-main md:text-3xl">{studio.name}</h1>
          <div className="mt-2 text-sm text-text-sec">{UI_FMT.ratingLabel(studio.rating, studio.reviews)}</div>
          {mapsHref ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm text-text-sec underline underline-offset-2 hover:text-text-main"
            >
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span>{studio.address}</span>
            </a>
          ) : null}
        </div>

        {hideBooking ? null : (
          // BOOKING-WIDGET-DIALOG: окно записи с первого шага; ссылки с
          // `?serviceId=` / `?master=` открывают его сами (StudioBookingAutoOpen).
          <Button asChild className="shrink-0">
            <StudioBookingLink href={bookingHref}>{UI_TEXT.publicStudio.heroBook}</StudioBookingLink>
          </Button>
        )}
      </div>
    </section>
  );
}

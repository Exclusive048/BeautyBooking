"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import { UI_TEXT } from "@/lib/ui/text";
import { withQuery } from "@/lib/public-urls";
import { Button } from "@/components/ui/button";
import { FocalImage } from "@/components/ui/focal-image";

type StudioHeroData = {
  name: string;
  rating: number;
  reviews: number;
  address: string;
  geoLat?: number | null;
  geoLng?: number | null;
};

type HeroImageItem = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type Props = {
  studio: StudioHeroData;
  imageItems: HeroImageItem[];
  bookingHref: string;
};

export function StudioHeroGallery({ studio, imageItems, bookingHref }: Props) {
  const mapsHref = buildYandexMapsUrl({
    address: studio.address,
    lat: studio.geoLat ?? null,
    lon: studio.geoLng ?? null,
  });
  const searchParams = useSearchParams();
  const master = searchParams?.get("master") ?? undefined;
  const masterId = searchParams?.get("masterId") ?? undefined;
  const bookingUrl = withQuery(bookingHref, {
    serviceId: searchParams?.get("serviceId") ?? undefined,
    master: master ?? undefined,
    masterId: master ? undefined : masterId,
    slotStartAt: searchParams?.get("slotStartAt") ?? undefined,
  });

  const heroImages = imageItems.slice(0, 5);
  const primary = heroImages[0] ?? null;
  const secondary = heroImages.slice(1);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-bg-card shadow-card">
      <div className="grid gap-2 p-2 md:grid-cols-[2fr_1fr]">
        <div className="relative h-64 overflow-hidden rounded-2xl md:h-[420px]">
          {primary ? (
            <FocalImage
              src={primary.url}
              alt={studio.name}
              focalX={primary.focalX}
              focalY={primary.focalY}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-2 md:grid-rows-2">
          {Array.from({ length: 4 }).map((_, index) => {
            const item = secondary[index] ?? null;
            return (
              <div key={index} className="relative h-32 overflow-hidden rounded-2xl md:h-full">
                {item ? (
                  <FocalImage
                    src={item.url}
                    alt=""
                    focalX={item.focalX}
                    focalY={item.focalY}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-bg-input/35" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
        <div className="flex flex-col gap-4 rounded-2xl bg-black/45 p-4 backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">{studio.name}</h1>
            <div className="mt-2 text-sm text-white/90">{UI_FMT.ratingLabel(studio.rating, studio.reviews)}</div>
            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-sm text-white/85 underline underline-offset-2"
              >
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                <span>{studio.address}</span>
              </a>
            ) : null}
          </div>

          <Button asChild>
            <Link href={bookingUrl}>{UI_TEXT.publicStudio.heroBook}</Link>
          </Button>
        </div>
      </div>

      {!primary ? (
        <div className="absolute left-4 top-4 rounded-lg bg-black/45 px-3 py-1 text-xs text-white/80">
          {UI_TEXT.publicStudio.galleryFallback}
        </div>
      ) : null}
    </section>
  );
}

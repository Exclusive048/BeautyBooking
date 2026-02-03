"use client";

/* eslint-disable @next/next/no-img-element */
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type StudioHeroData = {
  name: string;
  rating: number;
  reviews: number;
  address: string;
};

type Props = {
  studio: StudioHeroData;
  imageUrls: string[];
};

export function StudioHeroGallery({ studio, imageUrls }: Props) {
  const hasAddress = studio.address.trim().length > 0;
  const mapsHref = hasAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(studio.address)}`
    : null;

  const heroImages = imageUrls.slice(0, 5);
  const primary = heroImages[0] ?? null;
  const secondary = heroImages.slice(1);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-neutral-900 shadow-lg">
      <div className="grid gap-2 p-2 md:grid-cols-[2fr_1fr]">
        <div className="relative h-64 overflow-hidden rounded-2xl md:h-[420px]">
          {primary ? (
            <img src={primary} alt={studio.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-2 md:grid-rows-2">
          {Array.from({ length: 4 }).map((_, index) => {
            const src = secondary[index] ?? null;
            return (
              <div key={index} className="relative h-32 overflow-hidden rounded-2xl md:h-full">
                {src ? (
                  <img src={src} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-white/5" />
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
                <span aria-hidden>📍</span>
                <span>{studio.address}</span>
              </a>
            ) : null}
          </div>

          <a
            href="#studio-booking-entry"
            className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white/90"
          >
            {UI_TEXT.publicStudio.heroBook}
          </a>
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

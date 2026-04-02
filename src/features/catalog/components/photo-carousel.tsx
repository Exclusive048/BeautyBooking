"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type PhotoCarouselProps = {
  photos: string[];
  alt: string;
};

export function PhotoCarousel({ photos, alt }: PhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const safePhotos = useMemo(() => photos.filter((item) => item.length > 0), [photos]);
  const hasPhotos = safePhotos.length > 0;
  const current = hasPhotos ? safePhotos[index % safePhotos.length] : null;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] bg-muted">
      {current ? (
        <Image
          src={current}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : null}

      {safePhotos.length > 1 ? (
        <>
          <Button
            variant="ghost"
            size="none"
            aria-label={UI_TEXT.catalog.carouselPrev}
            onClick={(e) => {
              e.stopPropagation();
              setIndex((prev) => (prev - 1 + safePhotos.length) % safePhotos.length);
            }}
            className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="none"
            aria-label={UI_TEXT.catalog.carouselNext}
            onClick={(e) => {
              e.stopPropagation();
              setIndex((prev) => (prev + 1) % safePhotos.length);
            }}
            className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Dot indicators */}
          <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1">
            {safePhotos.map((_, i) => (
              <button
                key={i}
                aria-label={`Фото ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

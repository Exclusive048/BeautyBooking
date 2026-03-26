"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
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
          <button
            type="button"
            aria-label={UI_TEXT.catalog.carouselPrev}
            onClick={() => setIndex((prev) => (prev - 1 + safePhotos.length) % safePhotos.length)}
            className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-white/40 bg-black/35 text-sm text-white backdrop-blur transition hover:bg-black/55"
          >
            &lt;
          </button>
          <button
            type="button"
            aria-label={UI_TEXT.catalog.carouselNext}
            onClick={() => setIndex((prev) => (prev + 1) % safePhotos.length)}
            className="absolute right-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-white/40 bg-black/35 text-sm text-white backdrop-blur transition hover:bg-black/55"
          >
            &gt;
          </button>
        </>
      ) : null}
    </div>
  );
}

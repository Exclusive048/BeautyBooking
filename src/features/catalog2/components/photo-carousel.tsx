"use client";

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
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : null}

      {safePhotos.length > 1 ? (
        <>
          <button
            type="button"
            aria-label={UI_TEXT.catalog.carouselPrev}
            onClick={() => setIndex((prev) => (prev - 1 + safePhotos.length) % safePhotos.length)}
            className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full border border-border bg-background/90 text-sm text-foreground"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={UI_TEXT.catalog.carouselNext}
            onClick={() => setIndex((prev) => (prev + 1) % safePhotos.length)}
            className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full border border-border bg-background/90 text-sm text-foreground"
          >
            ›
          </button>
        </>
      ) : null}
    </div>
  );
}


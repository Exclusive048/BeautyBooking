"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMAGE_ZOOM } from "@/components/ui/motion-classes";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { ResilientImage } from "@/components/ui/resilient-image";
import { scrollBehavior } from "@/lib/ui/scroll";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioPhoto } from "@/features/public-studio/components/studio-photos-grid";

const T = UI_TEXT.publicStudio.hero;

type Props = {
  photos: StudioPhoto[];
};

/**
 * STUDIO-HERO-INFO (2026-10-14) — работы студии полосой под баннером и
 * описанием: листаются пальцем (нативная прокрутка со scroll-snap), на ПК —
 * ещё и стрелками; нажатие открывает просмотр во весь экран. Крупная сетка
 * «Фотографии студии» ниже на странице остаётся (решение владельца).
 *
 * Скроллер и дорожка — разные элементы: `min-w-max` только на дорожке, иначе
 * полоса растягивает страницу (`lib/ui/horizontal-strip.test.ts`).
 */
export function StudioPortfolioStrip({ photos }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  const syncEdges = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const { scrollLeft, scrollWidth, clientWidth } = node;
    setEdges({ start: scrollLeft <= 1, end: scrollLeft + clientWidth >= scrollWidth - 1 });
  }, []);

  // Колбэк наблюдателя срабатывает и сразу после `observe` — так стрелки
  // узнают, есть ли что листать, без setState в теле эффекта.
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncEdges);
    observer.observe(node);
    return () => observer.disconnect();
  }, [syncEdges]);

  const page = (direction: -1 | 1) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: scrollBehavior() });
  };

  const scrollable = !(edges.start && edges.end);

  return (
    <section aria-label={T.worksTitle} className="border-t border-border-subtle pb-4 pt-3 md:pb-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-4 md:px-5">
        <h2 className="text-base font-semibold text-text-main">{T.worksTitle}</h2>
        {scrollable ? (
          <div className="hidden items-center gap-2 md:flex">
            <Button
              variant="icon"
              size="icon"
              aria-label={T.worksPrev}
              disabled={edges.start}
              onClick={() => page(-1)}
              className="rounded-full"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
            <Button
              variant="icon"
              size="icon"
              aria-label={T.worksNext}
              disabled={edges.end}
              onClick={() => page(1)}
              className="rounded-full"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        onScroll={syncEdges}
        className="snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-4 scroll-px-4 scrollbar-hide md:px-5 md:scroll-px-5"
      >
        <div className="flex min-w-max gap-2 md:gap-3">
          {photos.map((photo, index) => (
            <Button
              key={photo.url}
              variant="wrapper"
              size="none"
              onClick={() => setViewerIndex(index)}
              aria-label={UI_TEXT.publicStudio.openPhotoAria.replace("{title}", photo.caption ?? photo.alt)}
              className="group relative block aspect-[4/5] w-36 shrink-0 snap-start overflow-hidden rounded-2xl border border-border-subtle bg-bg-input sm:w-44 md:w-48"
            >
              <ResilientImage
                src={photo.url}
                alt={photo.alt}
                sizes="(max-width: 640px) 144px, 192px"
                loading={index < 4 ? undefined : "lazy"}
                className={`object-cover ${IMAGE_ZOOM}`}
              />
              {photo.caption ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2.5 pb-2 pt-8 text-left">
                  <span className="block truncate text-2xs font-medium text-white/90">{photo.caption}</span>
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>

      <PhotoViewer
        items={photos.map((photo) => ({
          key: photo.url,
          src: photo.url,
          alt: photo.alt,
          caption: photo.caption,
        }))}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={closeViewer}
      />
    </section>
  );
}

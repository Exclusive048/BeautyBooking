"use client";

import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { scrollBehavior } from "@/lib/ui/scroll";
import { UI_TEXT } from "@/lib/ui/text";

type PhotoCarouselProps = {
  photos: string[];
  alt: string;
  /** Кадр задаёт поверхность: пропорции и скругление (`aspect-*`, `rounded-*`). */
  className?: string;
  sizes?: string;
  /** Что показать, когда фото нет вовсе. */
  placeholder?: ReactNode;
  /** Затемнение точек, пока поверх фото показан другой слой (кнопка записи). */
  dotsClassName?: string;
};

const DEFAULT_SIZES = "(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw";

const ARROW_CLASS =
  "absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 focus-visible:opacity-100 group-hover:opacity-100 md:flex";

/**
 * CATALOG-CARD-CAROUSEL — фото карточки листаются пальцем.
 *
 * Лента — нативная прокрутка со scroll-snap, а не JS-перетаскивание: на
 * телефоне это жест системы (инерция, отскок, вертикальная прокрутка страницы
 * не блокируется), а клик по карточке не срабатывает на свайпе сам собой.
 * Стрелки — только для мыши (`md:` + hover): на тач-экране они лишь закрывали
 * бы фото. Скроллер — сам элемент с `overflow-x-auto`, кадры — `w-full
 * shrink-0` внутри него, поэтому ширина страницы от ленты не растёт
 * (`lib/ui/horizontal-strip.test.ts`).
 *
 * Кнопки гасят и всплытие, и действие по умолчанию: карусель живёт внутри
 * ссылки на профиль, и одно `stopPropagation` оставляло переход по ссылке.
 */
export function PhotoCarousel({
  photos,
  alt,
  className,
  sizes = DEFAULT_SIZES,
  placeholder,
  dotsClassName,
}: PhotoCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const safePhotos = useMemo(() => photos.filter((item) => item.length > 0), [photos]);
  const count = safePhotos.length;

  const syncIndex = () => {
    const node = scrollerRef.current;
    if (!node || node.clientWidth === 0) return;
    const next = Math.round(node.scrollLeft / node.clientWidth);
    setIndex(Math.min(Math.max(next, 0), count - 1));
  };

  const goTo = (target: number) => (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const node = scrollerRef.current;
    if (!node || count === 0) return;
    const wrapped = (target + count) % count;
    node.scrollTo({ left: wrapped * node.clientWidth, behavior: scrollBehavior() });
  };

  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", className)}>
      {count === 0 ? (
        placeholder ?? null
      ) : (
        <div
          ref={scrollerRef}
          onScroll={count > 1 ? syncIndex : undefined}
          className="flex h-full w-full touch-manipulation snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-hide"
        >
          {safePhotos.map((src, photoIndex) => (
            <div key={`${src}-${photoIndex}`} className="relative h-full w-full shrink-0 snap-start snap-always">
              <ResilientImage
                src={src}
                alt={count > 1 ? `${alt} — ${UI_TEXT.a11y.photoIndex(photoIndex + 1)}` : alt}
                sizes={sizes}
                loading={photoIndex === 0 ? undefined : "lazy"}
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {count > 1 ? (
        <>
          <Button
            variant="wrapper"
            size="none"
            aria-label={UI_TEXT.catalog.carouselPrev}
            onClick={goTo(index - 1)}
            onKeyDown={(event) => event.stopPropagation()}
            className={cn(ARROW_CLASS, "left-2")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="wrapper"
            size="none"
            aria-label={UI_TEXT.catalog.carouselNext}
            onClick={goTo(index + 1)}
            onKeyDown={(event) => event.stopPropagation()}
            className={cn(ARROW_CLASS, "right-2")}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>

          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1 transition-opacity",
              dotsClassName,
            )}
          >
            {safePhotos.map((src, dotIndex) => (
              <span
                key={`${src}-${dotIndex}`}
                className={cn(
                  "h-1.5 rounded-full shadow-sm transition-all duration-300",
                  dotIndex === index ? "w-4 bg-white" : "w-1.5 bg-white/60",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoOnBlur } from "@/components/ui/photo-on-blur";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { scrollBehavior } from "@/lib/ui/scroll";
import * as UI_TEXT from "@/lib/ui/text";

type PhotoCarouselProps = {
  photos: string[];
  alt: string;
  /** Скругление и прочее оформление кадра; пропорции кадра задаёт сама карусель. */
  className?: string;
  /** Что показать, когда фото нет вовсе. */
  placeholder?: ReactNode;
  /** Затемнение точек, пока поверх фото показан другой слой (кнопка записи). */
  dotsClassName?: string;
};

// Сетка выдачи: один столбец на телефоне, два с `md`, три с `xl`.
const FRAME_SIZES = "(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw";
const TILE_SIZES = "(max-width: 767px) 50vw, (max-width: 1279px) 25vw, 17vw";

const ARROW_CLASS =
  "absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 focus-visible:opacity-100 group-hover:opacity-100 md:flex";

/**
 * CATALOG-CARD-CAROUSEL — фото карточки листаются пальцем.
 *
 * Лента — нативная прокрутка со scroll-snap, а не JS-перетаскивание: на
 * телефоне это жест системы (инерция, отскок, вертикальная прокрутка страницы
 * не блокируется), а клик по карточке не срабатывает на свайпе сам собой.
 * Стрелки — только для мыши (`md:` + hover): на тач-экране они лишь закрывали
 * бы фото. Скроллер — сам элемент с `overflow-x-auto`, плитки — половина
 * его ширины (`shrink-0`) внутри него, поэтому ширина страницы от ленты не растёт
 * (`lib/ui/horizontal-strip.test.ts`).
 *
 * Кнопки гасят и всплытие, и действие по умолчанию: карусель живёт внутри
 * ссылки на профиль, и одно `stopPropagation` оставляло переход по ссылке.
 *
 * PORTFOLIO-CROP-01 (решение владельца 2026-10-13) — работы в кадре видны
 * ЦЕЛИКОМ: работа портфолио — 4:5, кадр карточки — 16:10 (низкая карточка), то
 * есть в кадр ровно входят две работы рядом. Лента листается по одной работе
 * (снап на каждой плитке, позиций на одну меньше, чем фото), поэтому на
 * последней позиции видны две последние работы, а не одна с пустой половиной.
 * Одна работа — по центру на размытой копии себя (`PhotoOnBlur`): растянутая
 * на 16:10, она потеряла бы больше половины высоты кадра, выбранного мастером.
 */
export function PhotoCarousel({
  photos,
  alt,
  className,
  placeholder,
  dotsClassName,
}: PhotoCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const safePhotos = useMemo(() => photos.filter((item) => item.length > 0), [photos]);
  const count = safePhotos.length;
  // Видны две работы сразу, поэтому позиций прокрутки на одну меньше, чем фото.
  const positions = Math.max(count - 1, 1);

  /** Шаг ленты — плитка плюс зазор: расстояние между началами соседних плиток. */
  const stepOf = (node: HTMLDivElement) => {
    const [first, second] = Array.from(node.children) as HTMLElement[];
    return first && second ? second.offsetLeft - first.offsetLeft : node.clientWidth;
  };

  const syncIndex = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const step = stepOf(node);
    if (step <= 0) return;
    const next = Math.round(node.scrollLeft / step);
    setIndex(Math.min(Math.max(next, 0), positions - 1));
  };

  const goTo = (target: number) => (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const node = scrollerRef.current;
    if (!node || positions < 2) return;
    const wrapped = (target + positions) % positions;
    node.scrollTo({ left: wrapped * stepOf(node), behavior: scrollBehavior() });
  };

  const photoAlt = (photoIndex: number) =>
    count > 1 ? `${alt} — ${UI_TEXT.a11y.photoIndex(photoIndex + 1)}` : alt;

  return (
    <div className={cn("relative aspect-[16/10] w-full overflow-hidden bg-muted", className)}>
      {count === 0 ? (
        placeholder ?? null
      ) : count === 1 ? (
        <PhotoOnBlur src={safePhotos[0]} alt={alt} sizes={FRAME_SIZES} />
      ) : (
        <div
          ref={scrollerRef}
          onScroll={positions > 1 ? syncIndex : undefined}
          className="flex h-full w-full touch-manipulation snap-x snap-mandatory gap-0.5 overflow-x-auto overscroll-x-contain scrollbar-hide"
        >
          {/* Две плитки и зазор между ними — ровно ширина кадра. */}
          {safePhotos.map((src, photoIndex) => (
            <div
              key={`${src}-${photoIndex}`}
              className="relative h-full w-[calc(50%-1px)] shrink-0 snap-start snap-always"
            >
              <ResilientImage
                src={src}
                alt={photoAlt(photoIndex)}
                sizes={TILE_SIZES}
                loading={photoIndex < 2 ? undefined : "lazy"}
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {positions > 1 ? (
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
            {Array.from({ length: positions }, (_, dotIndex) => (
              <span
                key={dotIndex}
                className={cn(
                  "h-1.5 rounded-full shadow-sm transition-all duration-200",
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

import { cn } from "@/lib/cn";
import { ResilientImage } from "./resilient-image";

type Props = {
  src: string;
  alt: string;
  /** Ширина бокса для оптимизатора (`next/image`), как у `ResilientImage` в fill-режиме. */
  sizes: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  /** Классы переднего фото (например, `IMAGE_ZOOM`). */
  imageClassName?: string;
};

/**
 * PORTFOLIO-CROP-01 — фото ЦЕЛИКОМ в боксе другого формата: само фото
 * вписано (`object-contain`), поля закрыты его же размытой копией.
 *
 * Работа портфолио — 4:5 (`PORTFOLIO_ASPECT_RATIO`), а бокс карточки
 * каталога и главного кадра шапки студии — горизонтальный. Обрезка `cover`
 * отрезала бы от выбранного мастером кадра больше половины высоты, пустые
 * поля выглядели бы дырой. Размытая копия — та же картинка: оптимизатор
 * отдаёт её из кэша, второй загрузки нет.
 *
 * Родитель задаёт размеры и `position: relative`.
 */
export function PhotoOnBlur({ src, alt, sizes, priority, loading, imageClassName }: Props) {
  return (
    <>
      <span aria-hidden className="absolute inset-0 overflow-hidden">
        <ResilientImage
          src={src}
          alt=""
          sizes={sizes}
          priority={priority}
          loading={loading}
          className="scale-110 object-cover opacity-70 blur-2xl"
        />
      </span>
      <ResilientImage
        src={src}
        alt={alt}
        sizes={sizes}
        priority={priority}
        loading={loading}
        fit="contain"
        className={cn("object-contain", imageClassName)}
      />
    </>
  );
}

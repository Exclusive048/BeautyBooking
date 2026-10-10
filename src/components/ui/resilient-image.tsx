"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cropAreaImageStyle, toCropArea } from "@/lib/media/crop-geometry";
import { IMAGE_FALLBACK_SRC, isOptimizableImageSrc } from "./image-host";

/**
 * Режим размера (RESILIENT-IMAGE-FILL-SIZES). Fixed-size — `width` + `height`
 * (аватар с известными размерами); `sizes` по умолчанию выводится из `width`.
 * Fill — без размеров: картинка заполняет родителя (у него `position: relative`
 * и заданные размеры), и `sizes` ОБЯЗАТЕЛЕН: молчаливый дефолт `100vw`
 * заставлял бы оптимизатор отдавать картинку шириной во весь экран в плитку
 * на треть экрана — без ошибки сборки, теста и следа на глаз. Нужна ширина
 * экрана — так и пишется: `sizes="100vw"`.
 */
type ResilientImageSizing =
  | { width: number; height: number; sizes?: string }
  | { width?: undefined; height?: undefined; sizes: string };

type ResilientImageProps = ResilientImageSizing & {
  src: string;
  alt: string;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
  /**
   * CROP-PREVIEW-01 — как применить область обрезки.
   * `focal` (по умолчанию): `object-position` в центр области — приблизительно,
   * зато годится для бокса любых пропорций.
   * `exact`: область заполняет бокс целиком (`cropAreaImageStyle`) — ровно то,
   * что было в рамке кроппера. Только для fill-режима и только когда пропорции
   * бокса совпадают с пропорциями области (аватар: квадрат в квадрате), иначе
   * картинка исказится. В fixed-size режиме молча остаётся `focal`.
   */
  cropFit?: "focal" | "exact";
  quality?: number;
  priority?: boolean;
  loading?: "lazy" | "eager";
  /**
   * Skip `next/image` optimization (serves the raw URL). Mirrors the
   * `next/image` `unoptimized` flag — used where a caller deliberately wants
   * the original bytes (e.g. a full-screen lightbox view).
   */
  unoptimized?: boolean;
  /** Forwarded to `next/image` (e.g. story viewer marks an item viewed). */
  onLoad?: () => void;
  /**
   * Object-fit of the PLACEHOLDER fallback only. The real image's object-fit
   * stays driven by `className` (as before) so existing callers are unchanged;
   * `fit` keeps the fallback faithful for `object-contain` surfaces. Default
   * `"cover"` preserves prior behaviour.
   */
  fit?: "cover" | "contain";
  className?: string;
  style?: CSSProperties;
  /** Override the local placeholder shown when the image is unavailable. */
  fallbackSrc?: string;
  /**
   * RES-30: собственная замена вместо картинки-плейсхолдера.
   *
   * Дефолтный плейсхолдер — «фотография», и для аватара он врёт: у аватарных
   * поверхностей уже есть своя замена (инициалы), но срабатывала она только при
   * `avatarUrl === null`. Битый или неоптимизируемый URL — то же самое «фото
   * показать нечем», а выглядело иначе. Слот принимает готовую разметку
   * вызывающего, поэтому вторую копию инициалов заводить не нужно; имеет
   * приоритет над `fallbackSrc`.
   */
  fallback?: ReactNode;
};

function buildObjectPosition(
  cropX: number | null | undefined,
  cropY: number | null | undefined,
  cropWidth: number | null | undefined,
  cropHeight: number | null | undefined,
): string {
  if (cropX != null && cropY != null && cropWidth != null && cropHeight != null) {
    const cx = Math.round((cropX + cropWidth / 2) * 100);
    const cy = Math.round((cropY + cropHeight / 2) * 100);
    return `${cx}% ${cy}%`;
  }
  return "center";
}

/**
 * Shared focal/portfolio image renderer with per-image resilience (QA-102-L1).
 *
 * A master's avatar / portfolio URL can point at an UNCONFIGURED remote host
 * (not in `next.config` `images.remotePatterns`) or a DEAD/404 URL. Two
 * failure modes, both handled here so one bad image degrades to a placeholder
 * for THAT image only — never breaking the whole route:
 *
 *   1. Unconfigured host → `next/image` throws at render time (SSR + client).
 *      Guarded by `isOptimizableImageSrc(src)`: an unsafe host never reaches
 *      `<Image>`; we render the local placeholder directly. This is the
 *      server-side sanitization the `onError` path alone could not catch.
 *   2. Dead / 404 on an allowed host → `onError` flips to the placeholder.
 *
 * The placeholder is a local same-origin asset rendered as a CSS background
 * (no second `next/image` to fail, no raw `<img>`, identical box → no layout
 * shift, theme-neutral). Rule 13: client component, no server-only imports —
 * plain props + `next/image` only.
 *
 * The shared resilient image renderer — use this instead of a bare `next/image`
 * for any user-supplied image URL (avatars, portfolio, hero, banners), so one
 * bad/unconfigured/404 URL degrades to a placeholder for THAT image only.
 */
export function ResilientImage({
  src,
  alt,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  cropFit = "focal",
  width,
  height,
  sizes,
  quality,
  priority,
  loading,
  unoptimized,
  onLoad,
  fit = "cover",
  className,
  style,
  fallbackSrc,
  fallback,
}: ResilientImageProps) {
  const [errored, setErrored] = useState(false);
  const objectPosition = buildObjectPosition(cropX, cropY, cropWidth, cropHeight);
  const exactArea =
    cropFit === "exact" && !(width && height) ? toCropArea(cropX, cropY, cropWidth, cropHeight) : null;
  const combinedStyle: CSSProperties = { ...style, objectPosition };

  const showFallback = errored || !isOptimizableImageSrc(src);

  if (showFallback) {
    // RES-30: своя замена побеждает картинку-плейсхолдер. Возвращаем разметку
    // вызывающего как есть — он и решает про размер, форму и a11y.
    if (fallback !== undefined) return <>{fallback}</>;

    const placeholder = fallbackSrc ?? IMAGE_FALLBACK_SRC;
    const fallbackStyle: CSSProperties = {
      ...style,
      backgroundImage: `url("${placeholder}")`,
      backgroundSize: fit,
      backgroundPosition: objectPosition,
      backgroundRepeat: "no-repeat",
    };
    const decorative = alt.trim() === "";
    const a11y = decorative
      ? { "aria-hidden": true as const }
      : { role: "img" as const, "aria-label": alt };

    if (width && height) {
      return (
        <div
          {...a11y}
          className={className}
          style={{ ...fallbackStyle, width, height }}
        />
      );
    }
    return (
      <div
        {...a11y}
        className={cn("absolute inset-0", className)}
        style={fallbackStyle}
      />
    );
  }

  if (width && height) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes ?? `${width}px`}
        quality={quality}
        priority={priority}
        loading={loading}
        unoptimized={unoptimized}
        className={className}
        style={combinedStyle}
        onError={() => setErrored(true)}
        onLoad={onLoad}
      />
    );
  }

  if (exactArea) {
    // Растягивается и сдвигается ОБЁРТКА, а не <img>: `next/image` с `fill`
    // запрещает `style.width` (в dev — исключение, роняющее кабинет). Картинка
    // заполняет обёртку, а у обёртки пропорции исходника — `object-cover`
    // внутри ничего не срезает.
    return (
      <div style={cropAreaImageStyle(exactArea)}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          quality={quality}
          priority={priority}
          loading={loading}
          unoptimized={unoptimized}
          className={className}
          style={style}
          onError={() => setErrored(true)}
          onLoad={onLoad}
        />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      quality={quality}
      priority={priority}
      loading={loading}
      unoptimized={unoptimized}
      className={className}
      style={combinedStyle}
      onError={() => setErrored(true)}
      onLoad={onLoad}
    />
  );
}

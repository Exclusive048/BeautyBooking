"use client";

import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  avatarUrl?: string | null;
  /** Размер и рамка круга задаёт вызывающий (`h-10 w-10`, `border-2` …). */
  className?: string;
  /** Для `next/image`: реальная ширина круга в CSS-пикселях. */
  sizePx: number;
};

/**
 * STUDIO-BOOKING-BANNER (2026-09-24) — круг мастера в мастере записи студии:
 * фото, если оно есть, иначе первая буква имени. Битая ссылка тоже даёт букву
 * (`ResilientImage fallback`), а не картинку-заглушку «фотография».
 */
export function MasterAvatar({ name, avatarUrl, className, sizePx }: Props) {
  const initial = (
    <span className="grid h-full w-full place-items-center bg-primary font-semibold text-white">
      {name.charAt(0).toUpperCase()}
    </span>
  );

  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-full", className)} aria-hidden>
      {avatarUrl ? (
        <ResilientImage
          src={avatarUrl}
          alt=""
          sizes={`${sizePx}px`}
          className="object-cover"
          fallback={initial}
        />
      ) : (
        initial
      )}
    </span>
  );
}

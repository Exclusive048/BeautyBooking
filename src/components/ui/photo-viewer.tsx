"use client";

import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoActionButton } from "@/components/ui/photo-action-button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import * as UI_TEXT from "@/lib/ui/text";

export type PhotoViewerItem = {
  /** Ключ кадра: смена кадра пересоздаёт картинку, а не тянет старую. */
  key: string;
  src: string;
  alt: string;
  /** Подпись под фото («мастер · услуга» и т.п.); пусто — полосы подписи нет. */
  caption?: ReactNode;
};

type Props = {
  items: readonly PhotoViewerItem[];
  /** Номер открытого кадра; `null` — просмотр закрыт. */
  index: number | null;
  /** Без него листания нет: стрелок, свайпа и счётчика. */
  onIndexChange?: (index: number) => void;
  onClose: () => void;
  /** Свои кнопки перед «Закрыть» (кабинет: «Заменить», «Удалить»). */
  actions?: ReactNode;
  /** Фото без оптимизации Next — приватные файлы кабинета оптимизатору недоступны. */
  unoptimized?: boolean;
};

/** Сдвиг пальца, после которого жест — листание, а не нажатие. */
const SWIPE_MIN_PX = 48;

/**
 * Просмотр фото во весь экран (PHOTO-VIEWER-01): тёмная подложка, фото
 * занимает всё свободное место, кнопки — на самом просмотре, а не за полями
 * фото. Нажатие мимо кнопок закрывает, стрелки клавиатуры и свайп листают,
 * Escape закрывает (`useOverlayA11y`: ловушка фокуса, возврат фокуса,
 * блокировка прокрутки). Через портал: предок с transform сделал бы `fixed`
 * относительным к себе.
 */
export function PhotoViewer({ items, index, onIndexChange, onClose, actions, unoptimized }: Props) {
  const isHydrated = useIsHydrated();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Свайп заканчивается кликом по подложке — он не должен закрыть просмотр.
  const swipedRef = useRef(false);

  const item = index === null ? undefined : items[index];
  const open = item !== undefined;
  const canBrowse = Boolean(onIndexChange) && items.length > 1;
  const hasPrevious = canBrowse && index !== null && index > 0;
  const hasNext = canBrowse && index !== null && index < items.length - 1;

  useOverlayA11y({ open, onClose, containerRef: rootRef, initialFocusRef: closeRef });

  const go = useCallback(
    (step: -1 | 1) => {
      if (index === null || !onIndexChange) return;
      const next = index + step;
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    if (!open || !canBrowse) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, canBrowse, go]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipedRef.current = false;
    swipeStartRef.current = canBrowse ? { x: event.clientX, y: event.clientY } : null;
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
    swipedRef.current = true;
    go(dx < 0 ? 1 : -1);
  };

  const handleBackdropClick = () => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    onClose();
  };

  if (!isHydrated || !item || index === null) return null;

  const T = UI_TEXT.common.photoViewer;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={T.dialog}
      tabIndex={-1}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStartRef.current = null;
      }}
      className="fixed inset-0 z-modal flex touch-pan-y touch-pinch-zoom flex-col bg-black/95"
      data-testid="photo-viewer"
    >
      <Button
        variant="wrapper"
        size="none"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={handleBackdropClick}
        aria-label={UI_TEXT.common.close}
      />

      <div className="pointer-events-none relative flex shrink-0 items-center justify-between gap-2 px-1 pb-1 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] sm:px-4 sm:pt-4">
        {canBrowse ? (
          <span className="px-3 font-mono text-xs text-white/70">
            {T.counter.replace("{current}", String(index + 1)).replace("{total}", String(items.length))}
          </span>
        ) : (
          <span aria-hidden />
        )}
        <div className="pointer-events-auto flex items-center">
          {actions}
          <PhotoActionButton ref={closeRef} label={UI_TEXT.common.close} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </PhotoActionButton>
        </div>
      </div>

      <div className="pointer-events-none relative mx-2 min-h-0 flex-1 sm:mx-16">
        <ResilientImage
          key={item.key}
          src={item.src}
          alt={item.alt}
          sizes="100vw"
          quality={90}
          fit="contain"
          className="object-contain"
          unoptimized={unoptimized}
        />
      </div>

      {item.caption ? (
        <div className="pointer-events-none relative shrink-0 break-words px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3 text-center text-sm text-white/85">
          {item.caption}
        </div>
      ) : (
        <div className="shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]" aria-hidden />
      )}

      {hasPrevious ? (
        <PhotoActionButton label={T.previous} onClick={() => go(-1)} className="absolute left-1 top-1/2 -translate-y-1/2 sm:left-4">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </PhotoActionButton>
      ) : null}
      {hasNext ? (
        <PhotoActionButton label={T.next} onClick={() => go(1)} className="absolute right-1 top-1/2 -translate-y-1/2 sm:right-4">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </PhotoActionButton>
      ) : null}
    </div>,
    document.body,
  );
}

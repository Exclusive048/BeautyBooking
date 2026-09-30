"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { List, MapPinOff, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CatalogMapPoint } from "@/features/catalog/types";
import { cn } from "@/lib/cn";
import { moneyRUBFromKopeks } from "@/lib/format";
import { providerPublicUrl } from "@/lib/public-urls";
import { scrollBehavior } from "@/lib/ui/scroll";
import * as UI_TEXT from "@/lib/ui/text";

const TM = UI_TEXT.catalog.map;
const TC = UI_TEXT.catalog2.card;

/** Совпадает с `px-4`/`scroll-px-4` скроллера: левая кромка снапа. */
const SNAP_INSET_PX = 16;
/** Тишина после последнего события прокрутки = свайп закончился. */
const SETTLE_MS = 140;

type Props = {
  points: CatalogMapPoint[];
  selectedId: string | null;
  /**
   * Прокрутить полосу к выбранной карточке. Истинно, когда выбор пришёл с
   * карты (тап по метке); когда выбор родила сама полоса (свайп), крутить её
   * обратно незачем — она уже там.
   */
  followSelection: boolean;
  onSelect: (id: string) => void;
  loading: boolean;
  /** Сколько найденных не попали на карту (нет координат). */
  missingCount: number;
  onShowList: () => void;
};

/**
 * Полоса карточек под картой, связанная с метками в обе стороны — паттерн
 * Booking / Яндекс Услуг / Airbnb: тап по метке прокручивает полосу к её
 * карточке, свайп полосы подсвечивает метку и ведёт к ней карту. Тап по
 * карточке — переход в профиль.
 *
 * Раньше тап по метке сразу уводил в профиль: промахнулся пальцем — потерял
 * карту и положение на ней, а сравнить двух соседних мастеров, не уходя со
 * страницы, было нельзя вовсе.
 *
 * Полоса стоит ПОД картой, а не поверх неё: низ карты несёт логотип и ссылку
 * на условия Яндекса, закрывать их нельзя.
 */
export function CatalogMapCarousel({
  points,
  selectedId,
  followSelection,
  onSelect,
  loading,
  missingCount,
  onShowList,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    onSelectRef.current = onSelect;
  }, [onSelect, selectedId]);

  useEffect(() => {
    if (!followSelection || !selectedId) return;
    const scroller = scrollerRef.current;
    const card = scroller?.querySelector<HTMLElement>(`[data-point-id="${CSS.escape(selectedId)}"]`);
    if (!scroller || !card) return;
    scroller.scrollTo({ left: card.offsetLeft - SNAP_INSET_PX, behavior: scrollBehavior() });
  }, [followSelection, selectedId]);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    },
    [],
  );

  const handleScroll = () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      // Выбранная карточка целиком видна — выбор не трогаем. Иначе тап по
      // метке последнего мастера перескакивал бы на предпоследнего: полоса
      // не может довести последнюю карточку до левой кромки, и ближайшей к
      // кромке оказывается соседняя.
      const current = selectedIdRef.current
        ? scroller.querySelector<HTMLElement>(`[data-point-id="${CSS.escape(selectedIdRef.current)}"]`)
        : null;
      if (
        current &&
        current.offsetLeft >= scroller.scrollLeft &&
        current.offsetLeft + current.offsetWidth <= scroller.scrollLeft + scroller.clientWidth
      ) {
        return;
      }
      const anchor = scroller.scrollLeft + SNAP_INSET_PX;
      let bestId: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const card of Array.from(scroller.querySelectorAll<HTMLElement>("[data-point-id]"))) {
        const distance = Math.abs(card.offsetLeft - anchor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = card.dataset.pointId ?? null;
        }
      }
      if (bestId && bestId !== selectedIdRef.current) onSelectRef.current(bestId);
    }, SETTLE_MS);
  };

  if (loading && points.length === 0) {
    return (
      <div className="flex gap-3 overflow-hidden px-4 py-3" aria-busy="true">
        {[0, 1].map((key) => (
          <Skeleton key={key} className="h-[84px] w-[min(80vw,300px)] shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-text-sec">{TM.emptyArea}</p>
        {missingCount > 0 ? (
          <Button variant="secondary" size="sm" onClick={onShowList} className="shrink-0 rounded-full">
            <List className="h-4 w-4" aria-hidden />
            {TM.showInList}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      className="relative snap-x snap-mandatory overflow-x-auto px-4 py-3 scroll-px-4 scrollbar-hide"
    >
      <ul aria-label={TM.carouselAria} className="flex min-w-max gap-3">
        {points.map((point) => (
          <li key={point.id} data-point-id={point.id} className="w-[min(80vw,300px)] shrink-0 snap-start">
            <MapCard point={point} selected={point.id === selectedId} onFocus={() => onSelect(point.id)} />
          </li>
        ))}
        {missingCount > 0 ? (
          <li className="w-[min(80vw,300px)] shrink-0 snap-start">
            <Button
              variant="wrapper"
              size="none"
              onClick={onShowList}
              className="flex h-full min-h-[84px] w-full items-center gap-3 rounded-2xl border border-dashed border-border-control bg-bg-card/80 px-4 text-left"
            >
              <MapPinOff className="h-5 w-5 shrink-0 text-text-sec" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-text-sec">{TM.missingTail(missingCount)}</span>
                <span className="mt-0.5 block text-sm font-medium text-accent-text">{TM.showInList}</span>
              </span>
            </Button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function MapCard({
  point,
  selected,
  onFocus,
}: {
  point: CatalogMapPoint;
  selected: boolean;
  onFocus: () => void;
}) {
  const href =
    providerPublicUrl({ id: point.id, publicUsername: point.publicUsername }, "catalog-map") ?? "#";
  const image = point.photoUrl ?? point.avatarUrl;
  const hasRating = point.reviewsCount > 0 && Number.isFinite(point.ratingAvg) && point.ratingAvg > 0;

  return (
    <Link
      href={href}
      onFocus={onFocus}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex h-[84px] items-center gap-3 rounded-2xl border bg-bg-card p-2.5 shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/40",
        selected ? "border-primary" : "border-border-subtle",
      )}
    >
      <div
        className={cn(
          "relative h-16 w-16 shrink-0 overflow-hidden bg-primary/10",
          point.type === "master" && !point.photoUrl ? "rounded-full" : "rounded-xl",
        )}
      >
        {image ? (
          <ResilientImage src={image} alt="" sizes="64px" className="object-cover" />
        ) : (
          <span
            aria-hidden
            className="grid h-full w-full place-items-center font-display text-xl text-accent-text"
          >
            {point.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-main">{point.title}</p>
        {point.subtitle ? <p className="truncate text-xs text-text-sec">{point.subtitle}</p> : null}
        <div className="mt-1 flex items-center gap-2 text-xs text-text-sec">
          {hasRating ? (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
              <span className="font-semibold tabular-nums text-text-main">{point.ratingAvg.toFixed(1)}</span>
              <span className="tabular-nums">({point.reviewsCount})</span>
            </span>
          ) : (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-accent-text">
              {TC.newLabel}
            </span>
          )}
          <span className="ml-auto whitespace-nowrap font-semibold text-text-main">
            {point.priceFrom && point.priceFrom > 0 ? (
              <>
                <span className="font-normal text-text-sec">{UI_TEXT.catalog.priceFrom} </span>
                <span className="tabular-nums">{moneyRUBFromKopeks(point.priceFrom)}</span>
              </>
            ) : (
              <span className="font-normal text-text-sec">{UI_TEXT.catalog.priceOnRequest}</span>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

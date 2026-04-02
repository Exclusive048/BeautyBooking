"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { StoryMaster } from "@/lib/feed/stories.service";

type Props = {
  masters: StoryMaster[];
  initialIndex: number;
  onClose: () => void;
};

const SWIPE_THRESHOLD = 50;
const AUTO_ADVANCE_MS = 5000;

export function StoryViewer({ masters, initialIndex, onClose }: Props) {
  const [masterIdx, setMasterIdx] = useState(initialIndex);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);

  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const master = masters[masterIdx] ?? null;
  const photo = master?.photos[photoIdx] ?? null;
  const totalPhotos = master?.photos.length ?? 0;

  const bookingUrl = master?.masterPublicUsername
    ? `/u/${master.masterPublicUsername}/booking`
    : master
      ? `/providers/${master.masterId}`
      : "/";

  const profileUrl = master?.masterPublicUsername
    ? `/u/${master.masterPublicUsername}`
    : master
      ? `/providers/${master.masterId}`
      : null;

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!master) return;
    timerRef.current = setTimeout(() => {
      if (photoIdx < totalPhotos - 1) {
        setDirection("left");
        setPhotoIdx((p) => p + 1);
      } else if (masterIdx < masters.length - 1) {
        setDirection("left");
        setMasterIdx((m) => m + 1);
        setPhotoIdx(0);
      } else {
        onClose();
      }
    }, AUTO_ADVANCE_MS);
  }, [master, photoIdx, totalPhotos, masterIdx, masters.length, onClose]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  useEffect(() => {
    if (direction) {
      const id = setTimeout(() => setDirection(null), 300);
      return () => clearTimeout(id);
    }
  }, [direction, photoIdx, masterIdx]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIdx, masterIdx]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!master) {
    onClose();
    return null;
  }

  function goNext() {
    setDirection("left");
    if (photoIdx < totalPhotos - 1) {
      setPhotoIdx((p) => p + 1);
    } else if (masterIdx < masters.length - 1) {
      setMasterIdx((m) => m + 1);
      setPhotoIdx(0);
    } else {
      onClose();
    }
  }

  function goPrev() {
    setDirection("right");
    if (photoIdx > 0) {
      setPhotoIdx((p) => p - 1);
    } else if (masterIdx > 0) {
      const prevMaster = masters[masterIdx - 1];
      setMasterIdx((m) => m - 1);
      setPhotoIdx((prevMaster?.photos.length ?? 1) - 1);
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }

  function handleTouchEnd() {
    if (touchDeltaX.current < -SWIPE_THRESHOLD) {
      goNext();
    } else if (touchDeltaX.current > SWIPE_THRESHOLD) {
      goPrev();
    }
    touchDeltaX.current = 0;
  }

  function handleTapNav(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      goPrev();
    } else {
      goNext();
    }
  }

  const animClass =
    direction === "left"
      ? "animate-slide-in-left"
      : direction === "right"
        ? "animate-slide-in-right"
        : "";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      {/* Progress bars */}
      <div className="absolute left-3 right-3 top-[env(safe-area-inset-top,12px)] z-20 flex gap-1 pt-2">
        {master.photos.map((_, i) => (
          <div
            key={master.photos[i].id}
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                i < photoIdx
                  ? "w-full bg-white"
                  : i === photoIdx
                    ? "w-full bg-white animate-progress"
                    : "w-0 bg-white"
              }`}
              style={i === photoIdx ? { animationDuration: `${AUTO_ADVANCE_MS}ms` } : undefined}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute left-0 right-0 top-[env(safe-area-inset-top,12px)] z-20 flex items-center gap-3 px-4 pt-7">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {master.masterAvatarUrl ? (
            <Image
              src={master.masterAvatarUrl}
              alt={master.masterName}
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
              {master.masterName[0]}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              {master.masterName}
            </div>
            {master.category ? (
              <div className="truncate text-xs text-white/70">{master.category}</div>
            ) : null}
          </div>
        </div>
        <Button
          variant="ghost"
          size="none"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          aria-label={UI_TEXT.actions.close}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Photo */}
      <div
        className="relative h-full w-full cursor-pointer"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTapNav}
        role="presentation"
      >
        {photo ? (
          <div key={`${master.masterId}-${photoIdx}`} className={`h-full w-full ${animClass}`}>
            <Image
              src={photo.mediaUrl}
              alt={photo.caption ?? master.masterName}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>
        ) : null}
      </div>

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-[env(safe-area-inset-bottom,16px)] pt-16">
        {photo?.caption ? (
          <p className="mb-3 line-clamp-2 text-sm text-white/90">{photo.caption}</p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {photo?.serviceName ? (
              <div className="truncate text-sm text-white/80">{photo.serviceName}</div>
            ) : null}
            {photo?.price ? (
              <div className="text-sm font-semibold text-white">
                {photo.price} {UI_TEXT.common.currencyRub}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {profileUrl ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="border border-white/30 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href={profileUrl} onClick={(e) => e.stopPropagation()}>
                  {UI_TEXT.home.card.viewProfile}
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" className="shrink-0">
              <Link href={bookingUrl} onClick={(e) => e.stopPropagation()}>
                {UI_TEXT.home.stories.bookNow}
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-2 text-center text-xs text-white/50">
          {UI_TEXT.home.stories.photoCount(photoIdx + 1, totalPhotos)}
        </div>
      </div>

      {/* Desktop nav arrows */}
      <Button
        variant="ghost"
        size="none"
        onClick={(e) => {
          e.stopPropagation();
          goPrev();
        }}
        className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20 md:block"
        aria-label="Previous"
      >
        <ChevronLeft className="h-6 w-6" />
      </Button>
      <Button
        variant="ghost"
        size="none"
        onClick={(e) => {
          e.stopPropagation();
          goNext();
        }}
        className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20 md:block"
        aria-label="Next"
      >
        <ChevronRight className="h-6 w-6" />
      </Button>
    </div>
  );
}

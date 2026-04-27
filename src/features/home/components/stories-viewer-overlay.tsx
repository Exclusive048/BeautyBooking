"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoriesViewer, type ViewerState } from "@/features/home/stories-viewer-context";
import { markItemViewed } from "@/features/home/stories-viewed-storage";
import type { StoriesGroup, StoryItem } from "@/features/home/types/stories";
import { formatRelativeTime } from "@/lib/utils/relative-time";
import { UI_TEXT } from "@/lib/ui/text";

const STORY_DURATION_MS = 5000;

function profileHrefFor(group: StoriesGroup): string {
  return group.username ? `/u/${group.username}` : `/providers/${group.masterId}`;
}

function preload(url: string): void {
  if (typeof window === "undefined" || !url) return;
  const img = new window.Image();
  img.src = url;
}

type InnerProps = {
  state: ViewerState;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onItemViewed: () => void;
};

function ViewerInner({ state, onClose, onNext, onPrev, onItemViewed }: InnerProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;

  const group = state.groups[state.activeMasterIdx];
  const item: StoryItem | undefined = group?.items[state.activeItemIdx];

  const [isPaused, setIsPaused] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const T = UI_TEXT.homeFeed.stories.viewer;

  // Focus management — initial focus on close button, manual tab-trap.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Body scroll lock.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Pause when tab hidden.
  useEffect(() => {
    const onVisibility = () => setIsPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Mark current item viewed once it loads (also called from <Image onLoad>).
  // Calling here too so non-image-load (e.g. image cached) still marks.
  useEffect(() => {
    if (!item) return;
    markItemViewed(item.id);
    onItemViewed();
  }, [item, onItemViewed]);

  // Preload next photo of current group + first photo of next master.
  useEffect(() => {
    if (!group) return;
    const nextItem = group.items[state.activeItemIdx + 1];
    if (nextItem) preload(nextItem.mediaUrl);
    const nextGroup = state.groups[state.activeMasterIdx + 1];
    const nextGroupFirst = nextGroup?.items[0];
    if (nextGroupFirst) preload(nextGroupFirst.mediaUrl);
  }, [group, state.activeItemIdx, state.activeMasterIdx, state.groups]);

  // Keyboard navigation — fires only when overlay is mounted.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onClose]);

  // Manual focus-trap on Tab.
  const handleTabTrap = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !overlayRef.current) return;
    const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Hold-to-pause (centre tap zone).
  const handleHoldStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPaused(true);
  }, []);
  const handleHoldEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsPaused(false);
  }, []);

  if (!group || !item) return null;

  const profileHref = profileHrefFor(group);
  const totalItems = group.items.length;
  const counterText = T.counter
    .replace("{current}", String(state.activeItemIdx + 1))
    .replace("{total}", String(totalItems));

  const handleAvatarClick = () => {
    onClose();
    router.push(profileHref);
  };

  const handleProgressComplete = (idx: number) => {
    if (idx !== state.activeItemIdx || isPaused || reduceMotion) return;
    onNext();
  };

  return (
    <motion.div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${T.title} — ${group.providerName}`}
      onKeyDown={handleTabTrap}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
    >
      {/* Desktop nav arrows */}
      <button
        type="button"
        onClick={onPrev}
        aria-label={T.previous}
        className="absolute left-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 md:block"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label={T.next}
        className="absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 md:block"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      {/* Frame: full on mobile, max-w on desktop */}
      <motion.div
        drag={reduceMotion ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
        dragElastic={0.4}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100) onClose();
        }}
        className="relative h-full w-full overflow-hidden bg-black md:h-[min(100dvh-2rem,860px)] md:w-[min(100vw-2rem,480px)] md:rounded-2xl"
      >
        {/* Slide animation between masters */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={group.masterId}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { x: state.direction * 80, opacity: 0 }
            }
            animate={reduceMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: -state.direction * 80, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {/* Photo */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={item.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
                className="absolute inset-0"
              >
                <Image
                  src={item.mediaUrl}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 480px"
                  className="object-contain"
                  priority
                  onLoad={() => {
                    markItemViewed(item.id);
                    onItemViewed();
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        {/* Progress bars — top */}
        <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
          {group.items.map((_, idx) => {
            const isPast = idx < state.activeItemIdx;
            const isCurrent = idx === state.activeItemIdx;
            return (
              <div
                key={idx}
                className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                {reduceMotion ? (
                  <div
                    className="h-full bg-white"
                    style={{ width: isPast || isCurrent ? "100%" : "0%" }}
                  />
                ) : (
                  <motion.div
                    className="h-full bg-white"
                    initial={false}
                    animate={{
                      width: isPast ? "100%" : isCurrent ? "100%" : "0%",
                    }}
                    transition={
                      isCurrent && !isPast
                        ? { duration: STORY_DURATION_MS / 1000, ease: "linear" }
                        : { duration: 0 }
                    }
                    style={isPaused && isCurrent ? { animationPlayState: "paused" } : undefined}
                    onAnimationComplete={() => handleProgressComplete(idx)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Counter (reduced-motion only — replaces dynamic progress) */}
        {reduceMotion ? (
          <span className="absolute left-3 top-6 z-20 font-mono text-xs text-white/70">
            {counterText}
          </span>
        ) : null}

        {/* Header */}
        <div className="absolute left-3 right-3 top-7 z-20 flex items-center gap-3">
          <button
            type="button"
            onClick={handleAvatarClick}
            aria-label={`${T.openProfile} — ${group.providerName}`}
            className="group flex min-w-0 items-center gap-2"
          >
            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-white/40 transition group-hover:ring-white">
              {group.avatarUrl ? (
                <Image
                  src={group.avatarUrl}
                  alt=""
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-white/20 text-xs font-semibold text-white">
                  {group.providerName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-white">
              {group.providerName}
            </span>
            <span className="hidden text-xs text-white/60 sm:inline">
              · {formatRelativeTime(item.createdAt)}
            </span>
          </button>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={T.close}
            className="ml-auto rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>

        {/* Tap zones (only when motion is allowed — otherwise visible buttons appear instead) */}
        {!reduceMotion ? (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label={T.previous}
              className="absolute bottom-0 left-0 top-16 z-10 w-1/3"
            />
            <button
              type="button"
              onClick={onNext}
              aria-label={T.next}
              className="absolute bottom-0 right-0 top-16 z-10 w-1/3"
            />
            <div
              className="absolute bottom-0 left-1/3 right-1/3 top-16 z-10"
              onPointerDown={handleHoldStart}
              onPointerUp={handleHoldEnd}
              onPointerCancel={handleHoldEnd}
              onPointerLeave={handleHoldEnd}
              aria-hidden
            />
          </>
        ) : null}

        {/* Visible nav buttons for reduced-motion users */}
        {reduceMotion ? (
          <div className="absolute bottom-6 left-0 right-0 z-20 flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrev}
              className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {T.previous}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNext}
              className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {T.next}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

export function StoriesViewerOverlay() {
  const { state, close, next, prev, bumpViewedRevision } = useStoriesViewer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const handleItemViewed = useMemo(
    () => () => bumpViewedRevision(),
    [bumpViewedRevision],
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {state ? (
        <ViewerInner
          key="stories-viewer"
          state={state}
          onClose={close}
          onNext={next}
          onPrev={prev}
          onItemViewed={handleItemViewed}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

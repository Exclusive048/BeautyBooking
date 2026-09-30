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
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  animate,
  domMax,
  LazyMotion,
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { useStoriesViewer, type ViewerState } from "@/features/home/stories-viewer-context";
import { markItemViewed } from "@/features/home/stories-viewed-storage";
import type { StoriesGroup, StoryItem } from "@/features/home/types/stories";
import { formatRelativeTime } from "@/lib/utils/relative-time";
import { formatWorkCaption } from "@/lib/feed/work-caption";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";

const STORY_DURATION_MS = 5000;

function profileHrefFor(group: StoriesGroup): string {
  // Rule 12: link only via public username. `masterId` is now an opaque token
  // (not a real provider id), so the legacy `/providers/<id>` fallback is gone;
  // stories require published masters, which always have a publicUsername.
  return group.username ? `/u/${group.username}` : "#";
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
  // Эффект смены кадра читает паузу, не завися от неё: иначе снятие паузы
  // перезапускало бы полоску с нуля (STORIES-PROGRESS-01).
  const pausedRef = useRef(false);
  const setPaused = useCallback((next: boolean) => {
    pausedRef.current = next;
    setIsPaused(next);
  }, []);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // STORIES-PROGRESS-01: прогресс текущего кадра — одно MotionValue (0…100) и
  // императивный `animate()` с pause/play. Прежние общие `useAnimationControls`
  // держали подписку каждой полоски, хоть раз бывшей текущей (пройденные
  // заполнялись заново вместе с текущей), а у перемонтированной полоски
  // подписка появлялась позже `start()` — и новая полоска стояла на нуле.
  const progress = useMotionValue(0);
  const progressWidth = useTransform(progress, (value) => `${value}%`);
  const playbackRef = useRef<AnimationPlaybackControls | null>(null);
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);

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
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [setPaused]);

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

  // Новый кадр — отсчёт с нуля; по естественному концу — следующий кадр
  // (`stop()` при смене кадра `onComplete` не вызывает). Пауза сюда НЕ входит:
  // раньше её снятие тоже сбрасывало полоску, и удержанный кадр начинался заново.
  useEffect(() => {
    playbackRef.current?.stop();
    if (reduceMotion) {
      progress.set(100);
      playbackRef.current = null;
      return;
    }
    progress.set(0);
    // motion-canon: намеренно — это не переход, а таймер кадра: линейная
    // полоса ровно на время показа (STORY_DURATION_MS).
    const playback = animate(progress, 100, {
      duration: STORY_DURATION_MS / 1000,
      ease: "linear",
      onComplete: () => onNextRef.current(),
    });
    if (pausedRef.current) playback.pause();
    playbackRef.current = playback;
    return () => playback.stop();
  }, [state.activeMasterIdx, state.activeItemIdx, reduceMotion, progress]);

  // Пауза замораживает отсчёт, снятие — продолжает с того же места.
  useEffect(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    if (isPaused) playback.pause();
    else playback.play();
  }, [isPaused]);

  // Hold-to-pause (centre tap zone). Pointer capture guarantees pointerup fires
  // even if the finger drifts off the zone — so we don't need onPointerLeave.
  const handleHoldStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setPaused(true);
    },
    [setPaused],
  );
  const handleHoldEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setPaused(false);
    },
    [setPaused],
  );

  if (!group || !item) return null;

  const profileHref = profileHrefFor(group);
  const totalItems = group.items.length;
  const workCaption = formatWorkCaption(item.performerName, item.serviceTitle);
  const counterText = T.counter
    .replace("{current}", String(state.activeItemIdx + 1))
    .replace("{total}", String(totalItems));

  const handleAvatarClick = () => {
    onClose();
    router.push(profileHref);
  };

  return (
    <m.div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${T.title} — ${group.providerName}`}
      onKeyDown={handleTabTrap}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={MOTION.base}
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/95"
    >
      {/* Desktop nav arrows */}
      <Button variant="wrapper"
        onClick={onPrev}
        aria-label={T.previous}
        className="absolute left-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 md:block"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </Button>
      <Button variant="wrapper"
        onClick={onNext}
        aria-label={T.next}
        className="absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 md:block"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </Button>

      {/* Frame: full on mobile, max-w on desktop */}
      <m.div
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
          <m.div
            key={group.masterId}
            // Сдвиг между мастерами гасит `MotionConfig reducedMotion="user"`
            // (transform), прозрачность остаётся — тернарник по `reduceMotion` не нужен.
            initial={{ x: state.direction * 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -state.direction * 80, opacity: 0 }}
            transition={MOTION.base}
            className="absolute inset-0"
          >
            {/* Photo */}
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={item.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={MOTION.micro}
                className="absolute inset-0"
              >
                <ResilientImage
                  src={item.mediaUrl}
                  alt={T.photoAltTemplate
                    .replace("{provider}", group.providerName)
                    .replace("{current}", String(state.activeItemIdx + 1))
                    .replace("{total}", String(totalItems))}
                  sizes="(max-width: 768px) 100vw, 480px"
                  fit="contain"
                  className="object-contain"
                  priority
                  onLoad={() => {
                    markItemViewed(item.id);
                    onItemViewed();
                  }}
                />
              </m.div>
            </AnimatePresence>
          </m.div>
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
                {reduceMotion || !isCurrent ? (
                  <div
                    className="h-full bg-white"
                    style={{ width: isPast || (reduceMotion && isCurrent) ? "100%" : "0%" }}
                  />
                ) : (
                  // Только текущая полоска читает общий прогресс; пройденные и
                  // будущие — статичные 100% / 0% (STORIES-PROGRESS-01).
                  <m.div className="h-full bg-white" style={{ width: progressWidth }} />
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
          <Button variant="wrapper"
            onClick={handleAvatarClick}
            aria-label={`${T.openProfile} — ${group.providerName}`}
            className="group flex min-w-0 items-center gap-2"
          >
            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-white/40 transition group-hover:ring-white">
              {group.avatarUrl ? (
                <ResilientImage
                  src={group.avatarUrl}
                  alt=""
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
          </Button>

          <Button variant="wrapper"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={T.close}
            className="ml-auto rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" aria-hidden />
          </Button>
        </div>

        {/* STUDIO-PORTFOLIO-FEED: подпись работы — снизу слева, полупрозрачно,
            без нажатий; под ней тап-зоны (pointer-events-none). */}
        {workCaption ? (
          <div
            className={cn(
              "pointer-events-none absolute left-3 right-16 z-20",
              reduceMotion ? "bottom-20" : "bottom-5",
            )}
          >
            <p className="inline-block max-w-full truncate rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur-sm">
              {workCaption}
            </p>
          </div>
        ) : null}

        {/* Tap zones (only when motion is allowed — otherwise visible buttons appear instead) */}
        {!reduceMotion ? (
          <>
            <Button variant="wrapper"
              onClick={onPrev}
              aria-label={T.previous}
              className="absolute bottom-0 left-0 top-16 z-10 w-1/3"
            />
            <Button variant="wrapper"
              onClick={onNext}
              aria-label={T.next}
              className="absolute bottom-0 right-0 top-16 z-10 w-1/3"
            />
            <div
              className="absolute bottom-0 left-1/3 right-1/3 top-16 z-10"
              onPointerDown={handleHoldStart}
              onPointerUp={handleHoldEnd}
              onPointerCancel={handleHoldEnd}
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
      </m.div>
    </m.div>
  );
}

export function StoriesViewerOverlay() {
  const { state, close, next, prev, bumpViewedRevision } = useStoriesViewer();
  // MODAL-SSR-OPEN-HYDRATION: общий гейт портала вместо setState в эффекте.
  const mounted = useIsHydrated();

  const handleItemViewed = useMemo(
    () => () => bumpViewedRevision(),
    [bumpViewedRevision],
  );

  if (!mounted) return null;

  // Свайп вниз закрывает (`drag`) — перетаскивание не входит в лёгкий набор
  // шелла (`domAnimation`). Модуль и так грузится лениво (`stories-viewer-overlay-lazy`),
  // поэтому полный набор едет только в его чанке (29.09 доработки · 19).
  return createPortal(
    <LazyMotion features={domMax}>
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
      </AnimatePresence>
    </LazyMotion>,
    document.body,
  );
}

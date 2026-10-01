"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PRESS } from "@/components/ui/motion-classes";
import { ResilientImage } from "@/components/ui/resilient-image";
import { m } from "framer-motion";
import { useStoriesViewer } from "@/features/home/stories-viewer-context";
import {
  getViewedItemIds,
  isMasterFullyViewed,
} from "@/features/home/stories-viewed-storage";
import type { StoriesGroup, StoriesPayload } from "@/features/home/types/stories";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/http/client";
import { DISTANCE, MOTION, STAGGER } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetchJson<StoriesPayload>(url);

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: MOTION.base,
  },
};

function StoryRing({
  group,
  isViewed,
  onSelect,
}: {
  group: StoriesGroup;
  isViewed: boolean;
  onSelect: (group: StoriesGroup) => void;
}) {
  const T = UI_TEXT.homeFeed.stories;
  const itemAnim = itemVariants;
  const initials = group.providerName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <m.div variants={itemAnim} className="w-[84px] shrink-0 snap-start sm:w-[92px]">
    <Button
      variant="wrapper"
      onClick={() => onSelect(group)}
      aria-label={`${T.cardLabel} ${group.providerName}`}
      className="w-full rounded-2xl focus-visible:ring-primary-glow/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
    >
      {/* Нажатие — классом на вложенном элементе: framer оставляет на кнопке
          inline-transform после появления, и `active:` на ней не сработал бы
          (29.09 доработки · 19). */}
      <span className={cn("flex w-full flex-col items-center gap-1.5 transition-transform duration-200 ease-brand", PRESS)}>
        <div className="relative">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full p-[2.5px] sm:h-[72px] sm:w-[72px] ${
              isViewed ? "bg-border-subtle p-[1px]" : "bg-brand-gradient"
            }`}
          >
            <div className="relative h-full w-full overflow-hidden rounded-full bg-bg-card">
              {group.avatarUrl ? (
                <ResilientImage
                  src={group.avatarUrl}
                  alt=""
                  sizes="72px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-semibold text-accent-text">
                  {initials || "?"}
                </span>
              )}
            </div>
          </div>

          {/* Visual dot indicator for unviewed — supplements the gradient ring for color-blind users */}
          {!isViewed ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary-magenta ring-2 ring-bg-page"
            />
          ) : null}
          {!isViewed ? <span className="sr-only">{T.newWorksSr}</span> : null}
        </div>

        <span className="line-clamp-1 max-w-full text-2xs font-medium text-text-main sm:text-xs">
          {group.providerName}
        </span>
      </span>
    </Button>
    </m.div>
  );
}

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-4 sm:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 sm:w-[92px]">
          <div className="h-16 w-16 animate-pulse rounded-full bg-bg-input/60 sm:h-[72px] sm:w-[72px]" />
          <div className="h-3 w-12 animate-pulse rounded bg-bg-input/60" />
        </div>
      ))}
    </div>
  );
}

export function StoriesRail() {
  const { open, viewedRevision } = useStoriesViewer();
  const container = containerVariants;
  const { data, isLoading, error } = useSWR<StoriesPayload>(
    "/api/feed/stories",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );
  const [viewedItemIds, setViewedItemIds] = useState<Set<string>>(() => new Set());

  // Hydrate viewed ids from localStorage after mount (avoid SSR mismatch).
  // Re-read whenever viewer marks a new item viewed (viewedRevision bumps).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewedItemIds(getViewedItemIds());
  }, [viewedRevision]);

  const groups = data?.groups ?? [];
  const T = UI_TEXT.homeFeed.stories;

  const onSelect = (group: StoriesGroup) => {
    const idx = groups.findIndex((g) => g.masterId === group.masterId);
    if (idx >= 0) open(groups, idx);
  };

  // Loading: skeleton with reserved height, no layout-jump when groups load
  if (isLoading && !data) {
    return (
      <section data-testid="stories-rail" aria-label={T.railAria} className="-mx-4 sm:-mx-6">
        <RailSkeleton />
      </section>
    );
  }

  // Error or empty → render nothing (per prompt: do not show empty state)
  if (error || groups.length === 0) {
    return null;
  }

  return (
    <m.section
      data-testid="stories-rail"
      initial={{ opacity: 0, y: -DISTANCE.nudge }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.section}
      aria-label={T.railAria}
      className="-mx-4 sm:-mx-6"
    >
      <m.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 pt-1 sm:gap-4 sm:px-6"
      >
        {groups.map((group) => (
          <StoryRing
            key={group.masterId}
            group={group}
            isViewed={isMasterFullyViewed(group, viewedItemIds)}
            onSelect={onSelect}
          />
        ))}
      </m.div>
    </m.section>
  );
}

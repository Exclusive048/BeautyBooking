"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { UI_TEXT } from "@/lib/ui/text";
import type { StoryMaster } from "@/lib/feed/stories.service";
import type { ApiResponse } from "@/lib/types/api";
import { StoryViewer } from "@/features/home/components/story-viewer";

function AvatarBubble({
  master,
  onClick,
}: {
  master: StoryMaster;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
    >
      <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-primary/60 via-accent/50 to-primary/80 p-[2.5px]">
        <div className="h-full w-full overflow-hidden rounded-full bg-bg-card">
          {master.masterAvatarUrl ? (
            <Image
              src={master.masterAvatarUrl}
              alt={master.masterName}
              width={60}
              height={60}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-semibold text-primary">
              {master.masterName
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          )}
        </div>
      </div>
      <span className="w-full truncate text-center text-[11px] leading-tight text-text-sec">
        {master.masterName.split(" ")[0]}
      </span>
    </button>
  );
}

export function PortfolioStoriesBar() {
  const [masters, setMasters] = useState<StoryMaster[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const fetchStories = useCallback(async () => {
    try {
      const res = await fetch("/api/home/stories", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        masters: StoryMaster[];
      }> | null;
      if (!json || !json.ok) return;
      setMasters(json.data.masters);
    } catch {
      /* silent — graceful degradation */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void fetchStories();
  }, [fetchStories]);

  if (!loaded || masters.length === 0) return null;

  return (
    <>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-text-main">
          {UI_TEXT.home.stories.title}
        </h2>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {masters.map((master, i) => (
              <AvatarBubble
                key={master.masterId}
                master={master}
                onClick={() => setViewerIndex(i)}
              />
            ))}
          </div>
        </div>
      </section>

      {viewerIndex !== null ? (
        <StoryViewer
          masters={masters}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

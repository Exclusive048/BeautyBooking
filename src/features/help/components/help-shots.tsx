"use client";

import { useCallback, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMAGE_ZOOM } from "@/components/ui/motion-classes";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { ResilientImage } from "@/components/ui/resilient-image";
import type { HelpShot } from "@/features/help/content/help-types";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  shots: readonly HelpShot[];
};

/**
 * HELP-GUIDE-01 — снимки экрана в ответе: ряд превью (снимок телефона целиком,
 * подпись снизу), по нажатию — просмотр во весь экран с листанием между
 * снимками этого ответа. Длинный ряд прокручивается вбок внутри ответа, а не
 * раздвигает страницу.
 */
export function HelpShots({ shots }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  if (shots.length === 0) return null;

  return (
    <>
      <ul
        aria-label={UI_TEXT.help.shots.listAria}
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1"
      >
        {shots.map((item, index) => (
          <li key={item.src} className="w-24 shrink-0 sm:w-28">
            <Button
              variant="wrapper"
              size="none"
              onClick={() => setViewerIndex(index)}
              aria-label={UI_TEXT.help.shots.openAria.replace("{caption}", item.caption)}
              className="group relative block aspect-[390/844] w-full overflow-hidden rounded-xl border border-border-subtle bg-bg-input"
            >
              <ResilientImage
                src={item.src}
                alt={item.caption}
                sizes="112px"
                className={`object-cover ${IMAGE_ZOOM}`}
              />
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white"
              >
                <Maximize2 className="h-3 w-3" />
              </span>
            </Button>
            <p className="mt-1.5 text-xs leading-snug text-text-sec">{item.caption}</p>
          </li>
        ))}
      </ul>

      <PhotoViewer
        items={shots.map((item) => ({
          key: item.src,
          src: item.src,
          alt: item.caption,
          caption: item.caption,
        }))}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={closeViewer}
      />
    </>
  );
}

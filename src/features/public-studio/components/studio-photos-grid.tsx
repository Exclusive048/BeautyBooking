"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_ZOOM } from "@/components/ui/motion-classes";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { ResilientImage } from "@/components/ui/resilient-image";
import * as UI_TEXT from "@/lib/ui/text";

export type StudioPhoto = {
  url: string;
  alt: string;
  /** «Имя Фамилия · Услуга» (`formatWorkCaption`); пусто — фото без подписи. */
  caption: string | null;
};

type Props = {
  photos: StudioPhoto[];
};

/**
 * Фото на странице студии: плитка с подписью «мастер · услуга» открывает
 * просмотр во весь экран с листанием. Раньше фото не нажимались вовсе
 * (замечание владельца 2026-10-12).
 */
export function StudioPhotosGrid({ photos }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {photos.map((photo, index) => (
          <Button
            key={photo.url}
            variant="wrapper"
            size="none"
            onClick={() => setViewerIndex(index)}
            aria-label={UI_TEXT.publicStudio.openPhotoAria.replace("{title}", photo.caption ?? photo.alt)}
            className="group relative block aspect-square w-full overflow-hidden rounded-2xl border border-border-subtle bg-bg-input"
          >
            <ResilientImage
              src={photo.url}
              alt={photo.alt}
              sizes="(max-width: 768px) 50vw, 25vw"
              className={`object-cover ${IMAGE_ZOOM}`}
            />
            {photo.caption ? (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2.5 pb-2 pt-8 text-left">
                <span className="block truncate text-xs font-medium text-white/90">{photo.caption}</span>
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      <PhotoViewer
        items={photos.map((photo) => ({
          key: photo.url,
          src: photo.url,
          alt: photo.alt,
          caption: photo.caption,
        }))}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={closeViewer}
      />
    </>
  );
}

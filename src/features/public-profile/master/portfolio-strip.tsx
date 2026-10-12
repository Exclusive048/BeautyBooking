"use client";

import { useCallback, useState } from "react";
import { m } from "framer-motion";
import { HOVER_LIFT, IMAGE_ZOOM } from "@/components/ui/motion-classes";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { ResilientImage } from "@/components/ui/resilient-image";
import { MOTION, STAGGER } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

export type PortfolioWork = {
  id: string;
  mediaUrl: string;
  /** Описание работы от мастера. */
  caption: string | null;
  /** Что на фото: услуга, иначе одобренная категория (`workSubjectTitle`). */
  subject: string | null;
};

type Props = {
  items: PortfolioWork[];
};

function workAlt(item: PortfolioWork): string {
  return item.caption ?? item.subject ?? UI_TEXT.publicProfile.portfolio.untitledWork;
}

/**
 * Портфолио на странице мастера. Подпись работы — услуга, без имени мастера:
 * чья это страница, и так видно. Плитка открывает просмотр во весь экран с
 * листанием (`PhotoViewer`) — фото видно сразу, без ожидания карточки работы.
 */
export function PortfolioStrip({ items }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  return (
    <section className="lux-card rounded-3xl p-5">
      <h2 className="text-lg font-semibold text-text-main">{UI_TEXT.publicProfile.portfolio.title}</h2>
      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/70 p-4 text-sm text-text-sec">
          {UI_TEXT.publicProfile.portfolio.empty}
        </div>
      ) : (
        <m.div
          className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: STAGGER } } }}
        >
          {items.map((item, index) => (
            <m.div
              key={item.id}
              variants={{
                hidden: { opacity: 0, scale: 0.95 },
                visible: { opacity: 1, scale: 1, transition: MOTION.base },
              }}
            >
              <Button
                variant="wrapper"
                size="none"
                onClick={() => setViewerIndex(index)}
                aria-label={UI_TEXT.publicProfile.portfolio.openWork.replace("{title}", workAlt(item))}
                className={`group relative block aspect-square w-full overflow-hidden rounded-2xl border border-border-subtle bg-bg-input/60 hover:shadow-card ${HOVER_LIFT}`}
              >
                <ResilientImage
                  src={item.mediaUrl}
                  alt={workAlt(item)}
                  sizes="(max-width: 640px) 50vw, 33vw"
                  quality={90}
                  className={`object-cover ${IMAGE_ZOOM}`}
                />
                {item.subject ? (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2.5 pb-2 pt-8 text-left">
                    <span className="block truncate text-xs font-medium text-white/90">{item.subject}</span>
                  </span>
                ) : null}
              </Button>
            </m.div>
          ))}
        </m.div>
      )}

      <PhotoViewer
        items={items.map((item) => ({
          key: item.id,
          src: item.mediaUrl,
          alt: workAlt(item),
          caption:
            item.subject || item.caption ? (
              <>
                {item.subject ? <span className="block font-medium text-white">{item.subject}</span> : null}
                {item.caption && item.caption !== item.subject ? (
                  <span className="mt-1 block text-white/70">{item.caption}</span>
                ) : null}
              </>
            ) : null,
        }))}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={closeViewer}
      />
    </section>
  );
}

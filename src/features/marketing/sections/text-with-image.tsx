"use client";

import type { ReactNode } from "react";
import { m } from "framer-motion";
import { DISTANCE, MOTION, VIEWPORT_ONCE } from "@/lib/ui/motion";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  paragraphs: ReadonlyArray<string>;
  /** Optional decoration / illustration. When omitted, text takes the full width on lg+. */
  image?: ReactNode;
  /** Side for the image on lg+ — alternates create rhythm across stacked sections. */
  imagePosition?: "left" | "right";
};

export function TextWithImage({
  eyebrow,
  title,
  paragraphs,
  image,
  imagePosition = "right",
}: Props) {
  const initial = { opacity: 0, y: DISTANCE.rise };
  const whileInView = { opacity: 1, y: 0 };
  const transition = MOTION.section;

  // No image → single centered column. With image → 2-col split with optional flip.
  const hasImage = Boolean(image);

  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4">
        <div
          className={
            hasImage
              ? `grid gap-12 lg:grid-cols-2 lg:items-center ${
                  imagePosition === "left" ? "lg:grid-flow-col-dense" : ""
                }`
              : "mx-auto max-w-3xl"
          }
        >
          <m.div
            initial={initial}
            whileInView={whileInView}
            viewport={VIEWPORT_ONCE}
            transition={transition}
            className={hasImage && imagePosition === "left" ? "lg:col-start-2" : ""}
          >
            {eyebrow ? (
              <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent-text">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="mb-6 font-display text-3xl leading-tight text-text-main lg:text-4xl">
              {title}
            </h2>
            {paragraphs.map((p, i) => (
              <p key={i} className="mb-4 leading-relaxed text-text-sec last:mb-0">
                {p}
              </p>
            ))}
          </m.div>
          {hasImage ? (
            <m.div
              initial={initial}
              whileInView={whileInView}
              viewport={VIEWPORT_ONCE}
              transition={{ ...MOTION.section, delay: 0.08 }}
              className={imagePosition === "left" ? "lg:col-start-1" : ""}
            >
              {image}
            </m.div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

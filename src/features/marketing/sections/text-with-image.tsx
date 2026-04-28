"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  paragraphs: ReadonlyArray<string>;
  /** Optional decoration / illustration. When omitted, text takes the full width on lg+. */
  image?: ReactNode;
  /** Side for the image on lg+ — alternates create rhythm across stacked sections. */
  imagePosition?: "left" | "right";
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

export function TextWithImage({
  eyebrow,
  title,
  paragraphs,
  image,
  imagePosition = "right",
}: Props) {
  const reduce = useReducedMotion();
  const initial = reduce ? undefined : { opacity: 0, y: 18 };
  const whileInView = reduce ? undefined : { opacity: 1, y: 0 };
  const transition = reduce ? undefined : { duration: 0.5, ease: EASE };

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
          <motion.div
            initial={initial}
            whileInView={whileInView}
            viewport={{ once: true, margin: "-80px" }}
            transition={transition}
            className={hasImage && imagePosition === "left" ? "lg:col-start-2" : ""}
          >
            {eyebrow ? (
              <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
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
          </motion.div>
          {hasImage ? (
            <motion.div
              initial={initial}
              whileInView={whileInView}
              viewport={{ once: true, margin: "-80px" }}
              transition={reduce ? undefined : { duration: 0.5, ease: EASE, delay: 0.08 }}
              className={imagePosition === "left" ? "lg:col-start-1" : ""}
            >
              {image}
            </motion.div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

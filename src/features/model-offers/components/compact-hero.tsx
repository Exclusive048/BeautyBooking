"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  onLearnMoreClick: () => void;
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

/**
 * Compact hero for returning visitors. Same brand language as <HeroSection>
 * (eyebrow font-mono, italic Playfair accent, glow blobs) but smaller and
 * without CTAs — the user has been here before, get them to the offer list.
 */
export function CompactHero({ open, onLearnMoreClick }: Props) {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/8 blur-3xl dark:bg-primary/12"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary-magenta/8 blur-3xl dark:bg-primary-magenta/12"
      />

      <div className="relative mx-auto max-w-2xl px-4 py-12 text-center lg:py-16">
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 12 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={reduce ? undefined : { duration: 0.45, ease: EASE }}
        >
          <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {UI_TEXT.models.hero.eyebrow}
          </p>
          <h1 className="mb-4 font-display text-3xl leading-[1.1] text-text-main lg:text-4xl">
            Услуги{" "}
            <em className="font-display font-normal italic text-primary">со скидкой</em>
          </h1>
          <button
            type="button"
            onClick={onLearnMoreClick}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md text-sm text-text-sec transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
          >
            {UI_TEXT.models.compactHero.learnMore}
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </motion.div>
      </div>
    </section>
  );
}

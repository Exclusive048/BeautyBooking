"use client";

import { m } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DISTANCE, MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onLearnMoreClick: () => void;
};

/**
 * Compact hero for returning visitors. Same brand language as <HeroSection>
 * (eyebrow font-mono, italic Playfair accent, glow blobs) but smaller and
 * without CTAs — the user has been here before, get them to the offer list.
 */
export function CompactHero({ open, onLearnMoreClick }: Props) {

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-decor-primary blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-decor-magenta blur-3xl"
      />

      <div className="relative mx-auto max-w-2xl px-4 py-12 text-center lg:py-16">
        <m.div
          initial={{ opacity: 0, y: DISTANCE.rise }}
          animate={{ opacity: 1, y: 0 }}
          transition={MOTION.section}
        >
          <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent-text">
            {UI_TEXT.models.hero.eyebrow}
          </p>
          <h1 className="mb-4 font-display text-3xl leading-[1.1] text-text-main lg:text-4xl">
            Услуги{" "}
            <em className="font-display font-normal italic text-accent-text">со скидкой</em>
          </h1>
          <Button variant="wrapper"
            onClick={onLearnMoreClick}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md text-sm text-text-sec transition-colors hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
          >
            {UI_TEXT.models.compactHero.learnMore}
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        </m.div>
      </div>
    </section>
  );
}

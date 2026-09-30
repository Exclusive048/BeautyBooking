"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { m } from "framer-motion";
import { DISTANCE, MOTION, STAGGER } from "@/lib/ui/motion";
import { Button } from "@/components/ui/button";

type CTA = { label: string; href: string };

type Props = {
  /** Tiny uppercased label above the headline. */
  eyebrow?: string;
  /** Headline — pass JSX with <em className="font-display font-normal italic text-accent-text">…</em> for accents. */
  title: ReactNode;
  description: string;
  cta?: { primary?: CTA; secondary?: CTA };
  /** Optional decoration on the right (lg+). When omitted, headline stays centered like the homepage. */
  decoration?: ReactNode;
};

const CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.05 } },
};

const ITEM = {
  hidden: { opacity: 0, y: DISTANCE.rise },
  visible: { opacity: 1, y: 0, transition: MOTION.section },
};

export function HeroSection({ eyebrow, title, description, cta, decoration }: Props) {
  const variantsItem = ITEM;
  const variantsContainer = CONTAINER;

  // Two layouts: centered (like homepage) when no decoration, split when decoration provided.
  const split = Boolean(decoration);

  return (
    <m.section
      variants={variantsContainer}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-20 lg:py-24"
    >
      {/* Soft brand glow — same recipe as homepage hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[40rem] w-[40rem] rounded-full bg-decor-primary blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-40 h-[28rem] w-[28rem] rounded-full bg-decor-magenta blur-3xl"
      />

      <div
        className={
          split
            ? "relative mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-2 lg:items-center"
            : "relative mx-auto max-w-3xl text-center"
        }
      >
        <div className={split ? "" : ""}>
          {eyebrow ? (
            <m.p
              variants={variantsItem}
              className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent-text"
            >
              {eyebrow}
            </m.p>
          ) : null}

          <m.h1
            variants={variantsItem}
            className="mt-4 text-balance text-[2.25rem] font-bold leading-[1.1] tracking-tight text-text-main sm:text-5xl lg:text-[3.75rem]"
          >
            {title}
          </m.h1>

          <m.p
            variants={variantsItem}
            className={
              split
                ? "mt-5 max-w-xl text-base leading-relaxed text-text-sec sm:text-lg"
                : "mx-auto mt-5 max-w-2xl text-base leading-relaxed text-text-sec sm:text-lg"
            }
          >
            {description}
          </m.p>

          {cta?.primary || cta?.secondary ? (
            <m.div
              variants={variantsItem}
              className={
                split
                  ? "mt-8 flex flex-wrap gap-3"
                  : "mt-8 flex flex-wrap justify-center gap-3"
              }
            >
              {cta?.primary ? (
                <Button asChild variant="primary" size="lg">
                  <Link href={cta.primary.href}>{cta.primary.label}</Link>
                </Button>
              ) : null}
              {cta?.secondary ? (
                <Button asChild variant="ghost" size="lg">
                  <Link href={cta.secondary.href}>{cta.secondary.label}</Link>
                </Button>
              ) : null}
            </m.div>
          ) : null}
        </div>

        {split ? (
          <m.div
            variants={variantsItem}
            className="hidden lg:block"
          >
            {decoration}
          </m.div>
        ) : null}
      </div>
    </m.section>
  );
}

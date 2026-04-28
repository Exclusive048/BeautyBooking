"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

type CTA = { label: string; href: string };

type Props = {
  /** Tiny uppercased label above the headline. */
  eyebrow?: string;
  /** Headline — pass JSX with <em className="font-display font-normal italic text-primary">…</em> for accents. */
  title: ReactNode;
  description: string;
  cta?: { primary?: CTA; secondary?: CTA };
  /** Optional decoration on the right (lg+). When omitted, headline stays centered like the homepage. */
  decoration?: ReactNode;
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

const CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const ITEM = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function HeroSection({ eyebrow, title, description, cta, decoration }: Props) {
  const reduce = useReducedMotion();
  const variantsItem = reduce ? undefined : ITEM;
  const variantsContainer = reduce ? undefined : CONTAINER;

  // Two layouts: centered (like homepage) when no decoration, split when decoration provided.
  const split = Boolean(decoration);

  return (
    <motion.section
      variants={variantsContainer}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-20 lg:py-24"
    >
      {/* Soft brand glow — same recipe as homepage hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[40rem] w-[40rem] rounded-full bg-primary/8 blur-3xl dark:bg-primary/12"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-40 h-[28rem] w-[28rem] rounded-full bg-primary-magenta/8 blur-3xl dark:bg-primary-magenta/12"
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
            <motion.p
              variants={variantsItem}
              className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary"
            >
              {eyebrow}
            </motion.p>
          ) : null}

          <motion.h1
            variants={variantsItem}
            className="mt-4 text-balance text-[2.25rem] font-bold leading-[1.1] tracking-tight text-text-main sm:text-5xl lg:text-[3.75rem]"
          >
            {title}
          </motion.h1>

          <motion.p
            variants={variantsItem}
            className={
              split
                ? "mt-5 max-w-xl text-base leading-relaxed text-text-sec sm:text-lg"
                : "mx-auto mt-5 max-w-2xl text-base leading-relaxed text-text-sec sm:text-lg"
            }
          >
            {description}
          </motion.p>

          {cta?.primary || cta?.secondary ? (
            <motion.div
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
            </motion.div>
          ) : null}
        </div>

        {split ? (
          <motion.div
            variants={variantsItem}
            className="hidden lg:block"
          >
            {decoration}
          </motion.div>
        ) : null}
      </div>
    </motion.section>
  );
}

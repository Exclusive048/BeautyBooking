"use client";

import Link from "next/link";
import { m } from "framer-motion";
import { Button } from "@/components/ui/button";
import { DISTANCE, MOTION, STAGGER, VIEWPORT_ONCE } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: DISTANCE.rise },
  visible: {
    opacity: 1,
    y: 0,
    transition: MOTION.section,
  },
};

export function BecomeMasterBanner() {
  const T = UI_TEXT.homeGuest.becomeMaster;
  const container = containerVariants;
  const item = itemVariants;

  return (
    <m.section
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      className="relative overflow-hidden bg-brand-gradient px-6 py-20 text-white sm:px-10 sm:py-24"
    >
      {/* Decorative pastel blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 30%, rgba(254,198,211,0.18), transparent 50%), radial-gradient(circle at 80% 70%, rgba(186,212,237,0.14), transparent 50%)",
        }}
      />
      {/* Diagonal stripes overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 80px)",
        }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <m.h2
          variants={item}
          className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl"
        >
          <em className="font-display font-semibold italic">{T.title}</em>
        </m.h2>

        <m.p
          variants={item}
          className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg"
        >
          {T.subtitle}
        </m.p>

        <m.div
          variants={item}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button asChild variant="inverted" size="lg" className="min-w-[180px]">
            <Link href="/become-master">{T.cta}</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="min-w-[180px] border border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/how-it-works">{T.ctaSecondary}</Link>
          </Button>
        </m.div>
      </div>
    </m.section>
  );
}

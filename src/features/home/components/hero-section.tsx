"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
};

const stats = [
  {
    num: UI_TEXT.home.hero.statMasters,
    label: UI_TEXT.home.hero.statMastersLabel,
  },
  {
    num: UI_TEXT.home.hero.statCategories,
    label: UI_TEXT.home.hero.statCategoriesLabel,
  },
  {
    num: UI_TEXT.home.hero.statBookings,
    label: UI_TEXT.home.hero.statBookingsLabel,
  },
];

export function HeroSection() {
  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden rounded-[28px] border border-border-subtle/60 bg-gradient-to-br from-bg-card via-bg-page to-bg-page px-6 py-10 sm:px-10 sm:py-14"
    >
      {/* Decorative ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/8 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 right-0 h-64 w-64 rounded-full bg-accent/8 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
      />

      <div className="relative mx-auto max-w-2xl text-center">
        {/* Headline */}
        <motion.h1
          variants={itemVariants}
          className="text-[2.4rem] font-bold leading-[1.15] tracking-tight text-text-main sm:text-5xl lg:text-[3.25rem]"
        >
          {UI_TEXT.home.hero.title}{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {UI_TEXT.home.hero.titleHighlight}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="mx-auto mt-4 max-w-[480px] text-base leading-relaxed text-text-sec sm:text-lg"
        >
          {UI_TEXT.home.hero.subtitle}
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={itemVariants}
          className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button asChild size="lg" className="min-w-[168px]">
              <Link href="/catalog">{UI_TEXT.home.hero.ctaFind}</Link>
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button asChild variant="secondary" size="lg" className="min-w-[168px]">
              <Link href="/become-master">{UI_TEXT.home.hero.ctaBecome}</Link>
            </Button>
          </motion.div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          variants={itemVariants}
          className="mt-9 flex items-center justify-center gap-0 divide-x divide-border-subtle/60"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="px-5 text-center first:pl-0 last:pr-0 sm:px-7">
              <div className="text-xl font-bold tabular-nums text-text-main sm:text-2xl">
                {stat.num}
              </div>
              <div className="mt-0.5 text-xs text-text-sec">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.section>
  );
}

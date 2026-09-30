"use client";

import Link from "next/link";
import { m } from "framer-motion";
import { Button } from "@/components/ui/button";
import { DISTANCE, MOTION, STAGGER } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

const t = UI_TEXT.errorPages.notFound;

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER } },
};

const itemVariants = {
  hidden: { opacity: 0, y: DISTANCE.rise },
  visible: {
    opacity: 1,
    y: 0,
    transition: MOTION.base,
  },
};

export default function NotFound() {
  const container = containerVariants;
  const item = itemVariants;
  return (
    <div className="relative flex min-h-[80dvh] items-center justify-center overflow-hidden px-4 py-16">
      {/* Ambient gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/4 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.08] blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/3 top-2/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-magenta/[0.06] blur-[80px]"
      />

      <m.div
        className="relative z-10 text-center"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Giant 404 */}
        <m.div variants={item} className="select-none">
          <span className="bg-gradient-to-r from-primary via-primary-hover to-primary-magenta bg-clip-text text-[120px] font-black leading-none tracking-tighter text-transparent sm:text-[160px]">
            404
          </span>
        </m.div>

        {/* Title */}
        <m.h1
          variants={item}
          className="-mt-2 text-2xl font-bold text-text-main sm:text-3xl"
        >
          {t.title}
        </m.h1>

        {/* Subtitle */}
        <m.p
          variants={item}
          className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-text-sec"
        >
          {t.subtitle}
        </m.p>

        {/* Actions */}
        <m.div
          variants={item}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Button asChild>
            <Link href="/">{t.goHome}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/catalog">{t.goCatalog}</Link>
          </Button>
        </m.div>
      </m.div>
    </div>
  );
}

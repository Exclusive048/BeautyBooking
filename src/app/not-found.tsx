"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.pages.notFound;

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
};

export default function NotFound() {
  return (
    <div className="relative flex min-h-[80dvh] items-center justify-center overflow-hidden px-4 py-16">
      {/* Ambient gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/4 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/3 top-2/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-magenta/6 blur-[80px]"
      />

      <motion.div
        className="relative z-10 text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Giant 404 */}
        <motion.div variants={itemVariants} className="select-none">
          <span className="bg-gradient-to-r from-primary via-primary-hover to-primary-magenta bg-clip-text text-[120px] font-black leading-none tracking-tighter text-transparent sm:text-[160px]">
            404
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          variants={itemVariants}
          className="-mt-2 text-2xl font-bold text-text-main sm:text-3xl"
        >
          {t.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-text-sec"
        >
          {t.subtitle}
        </motion.p>

        {/* Actions */}
        <motion.div
          variants={itemVariants}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Button asChild>
            <Link href="/">{t.goHome}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/catalog">{t.goCatalog}</Link>
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}

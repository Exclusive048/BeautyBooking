"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function BecomeMasterBanner() {
  const T = UI_TEXT.homeGuest.becomeMaster;

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
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
        <motion.h2
          variants={itemVariants}
          className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl"
        >
          <em className="font-display font-semibold italic">{T.title}</em>
        </motion.h2>

        <motion.p
          variants={itemVariants}
          className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg"
        >
          {T.subtitle}
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="min-w-[180px] bg-white text-primary hover:bg-white/90">
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
        </motion.div>
      </div>
    </motion.section>
  );
}

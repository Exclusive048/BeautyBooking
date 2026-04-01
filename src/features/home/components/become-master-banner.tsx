"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

export function BecomeMasterBanner() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative overflow-hidden rounded-[24px] border border-primary/20 bg-gradient-to-br from-primary/6 via-bg-card to-accent/5 px-6 py-6 sm:px-8 sm:py-7"
    >
      {/* Decorative glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/8 blur-2xl"
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-main sm:text-base">
              {UI_TEXT.home.hero.becomeMasterTitle}
            </p>
            <p className="mt-0.5 text-sm text-text-sec">
              {UI_TEXT.home.hero.becomeMasterSubtitle}
            </p>
          </div>
        </div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="shrink-0"
        >
          <Button asChild size="md" className="w-full sm:w-auto">
            <Link href="/become-master">{UI_TEXT.home.hero.becomeMasterCta}</Link>
          </Button>
        </motion.div>
      </div>
    </motion.section>
  );
}

"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

export function ModelsHero() {
  return (
    <section
      className="relative overflow-hidden py-12 md:py-16"
      aria-labelledby="models-hero-heading"
    >
      {/* Gradient background */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent dark:from-pink-500/8 dark:via-purple-500/4"
        aria-hidden
      />
      {/* Decorative blobs */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-pink-400/10 blur-3xl dark:bg-pink-500/6"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-10 h-60 w-60 rounded-full bg-purple-400/10 blur-3xl dark:bg-purple-500/6"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-pink-200/60 bg-pink-50/80 px-4 py-1.5 text-xs font-semibold text-pink-700 dark:border-pink-800/40 dark:bg-pink-950/40 dark:text-pink-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {UI_TEXT.pages.models.heroBadge}
          </div>
        </motion.div>

        <motion.h1
          id="models-hero-heading"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
          className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl"
        >
          {UI_TEXT.pages.models.heading}{" "}
          <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
            {UI_TEXT.pages.models.headingHighlight}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
          className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg"
        >
          {UI_TEXT.pages.models.lead}
        </motion.p>
      </div>
    </section>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/lib/ui/text";
import type { PublicStats } from "@/lib/stats/public-stats";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
};

const STATS_MIN_MASTERS = 10;

function formatNum(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

type Props = {
  stats: PublicStats | null;
};

export function HeroSection({ stats }: Props) {
  const T = UI_TEXT.homeGuest;
  const router = useRouter();
  const [query, setQuery] = useState("");

  const showStats = stats !== null && stats.masters >= STATS_MIN_MASTERS;
  const eyebrowText = stats !== null && stats.masters >= STATS_MIN_MASTERS
    ? `${T.eyebrow} · ${formatNum(stats.masters)} ${T.eyebrowMastersSuffix}`
    : T.eyebrow;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/catalog?q=${encodeURIComponent(trimmed)}` : "/catalog");
  }

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-20 lg:py-24"
    >
      {/* Decorative blobs — CSS only, no SVG */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[40rem] w-[40rem] rounded-full bg-primary/8 blur-3xl dark:bg-primary/12"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-40 h-[28rem] w-[28rem] rounded-full bg-primary-magenta/8 blur-3xl dark:bg-primary-magenta/12"
      />

      <div className="relative mx-auto max-w-3xl text-center">
        {/* Eyebrow */}
        <motion.p
          variants={itemVariants}
          className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary"
        >
          {eyebrowText}
        </motion.p>

        {/* Headline with Fraunces italic accent */}
        <motion.h1
          variants={itemVariants}
          className="mt-4 text-balance text-[2.25rem] font-bold leading-[1.1] tracking-tight text-text-main sm:text-5xl lg:text-[3.75rem]"
        >
          {T.heroTitle}{" "}
          <em className="font-display font-normal italic text-primary">{T.heroTitleAccent}</em>{" "}
          {T.heroTitleAfter}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-text-sec sm:text-lg"
        >
          {T.heroSubtitle}
        </motion.p>

        {/* Search bar */}
        <motion.form
          variants={itemVariants}
          onSubmit={handleSubmit}
          className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-sec"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.searchPlaceholder}
              className="h-14 pl-12 pr-4 text-base"
              aria-label={T.searchPlaceholder}
            />
          </div>
          <Button type="submit" size="lg" className="h-14 px-7 text-base">
            {T.searchCta}
          </Button>
        </motion.form>

        {/* Stats — reserve height to avoid CLS */}
        <motion.div
          variants={itemVariants}
          className="mx-auto mt-8 flex min-h-[3rem] items-center justify-center"
        >
          {showStats && stats ? (
            <div className="flex items-center gap-0 divide-x divide-border-subtle">
              <div className="px-5 text-center first:pl-0 sm:px-7">
                <span className="font-mono text-base font-semibold tabular-nums text-text-main">
                  {formatNum(stats.bookings)}
                </span>
                <span className="ml-1.5 text-sm text-text-sec">{T.statsBookings}</span>
              </div>
              <div className="px-5 text-center last:pr-0 sm:px-7">
                <span className="font-mono text-base font-semibold tabular-nums text-text-main">
                  {formatNum(stats.services)}
                </span>
                <span className="ml-1.5 text-sm text-text-sec">услуг</span>
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </motion.section>
  );
}

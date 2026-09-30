"use client";

import Link from "next/link";
import { m } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FAQAccordionItem } from "@/components/ui/faq-accordion";
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

export function FAQSection() {
  const T = UI_TEXT.homeGuest.faq;
  const container = containerVariants;
  const item = itemVariants;

  return (
    <m.section
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      className="mx-auto max-w-3xl px-4 py-16 sm:py-20"
    >
      <m.div variants={item} className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-text-main sm:text-4xl">
          {T.title}{" "}
          <em className="font-display font-normal italic text-accent-text">{T.titleAccent}</em>
        </h2>
      </m.div>

      <m.div variants={item} className="mt-8 space-y-2.5">
        {T.items.map((item) => (
          <FAQAccordionItem key={item.q} item={item} />
        ))}
      </m.div>

      <m.div variants={item} className="mt-8 text-center">
        <Link
          href="/faq"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text transition-colors hover:text-accent-text-hover"
        >
          {T.seeAll}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </m.div>
    </m.section>
  );
}

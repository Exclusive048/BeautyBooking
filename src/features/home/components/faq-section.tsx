"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FAQAccordionItem } from "@/components/ui/faq-accordion";
import { UI_TEXT } from "@/lib/ui/text";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function FAQSection() {
  const T = UI_TEXT.homeGuest.faq;

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="mx-auto max-w-3xl px-4 py-16 sm:py-20"
    >
      <motion.div variants={itemVariants} className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-text-main sm:text-4xl">
          {T.title}{" "}
          <em className="font-display font-normal italic text-primary">{T.titleAccent}</em>
        </h2>
      </motion.div>

      <motion.div variants={itemVariants} className="mt-8 space-y-2.5">
        {T.items.map((item) => (
          <FAQAccordionItem key={item.q} item={item} />
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className="mt-8 text-center">
        <Link
          href="/faq"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
        >
          {T.seeAll}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </motion.div>
    </motion.section>
  );
}

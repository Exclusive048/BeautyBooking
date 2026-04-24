"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const CTA_HREF = "/become-master";

export function FooterCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border-subtle/80 bg-bg-elevated px-6 py-10 md:px-12 md:py-14"
    >
      {/* Subtle background accent */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-bg-elevated via-bg-elevated to-primary/5"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {UI_TEXT.footer.cta.hint}
            </span>
          </div>
          <h2 className="text-xl font-bold text-text-main md:text-2xl">
            {UI_TEXT.footer.cta.title}
          </h2>
          <p className="max-w-md text-sm text-text-sec">
            {UI_TEXT.footer.cta.subtitle}{" "}
          </p>
        </div>
        <Button asChild size="md" className="shrink-0">
          <Link href={CTA_HREF}>{UI_TEXT.footer.cta.button}</Link>
        </Button>
      </div>
    </motion.div>
  );
}

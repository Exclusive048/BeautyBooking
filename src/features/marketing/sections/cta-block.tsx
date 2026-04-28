"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

type CTA = { label: string; href: string };

type Props = {
  title: ReactNode;
  description?: string;
  cta: { primary: CTA; secondary?: CTA };
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

export function CTABlock({ title, description, cta }: Props) {
  const reduce = useReducedMotion();
  const initial = reduce ? undefined : { opacity: 0, y: 24 };
  const whileInView = reduce ? undefined : { opacity: 1, y: 0 };
  const transition = reduce ? undefined : { duration: 0.5, ease: EASE };

  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4">
        <motion.div
          initial={initial}
          whileInView={whileInView}
          viewport={{ once: true, margin: "-80px" }}
          transition={transition}
          className="rounded-3xl bg-brand-gradient p-10 text-center shadow-card sm:p-12 lg:p-16"
        >
          <h2 className="mb-4 font-display text-3xl text-white lg:text-4xl">{title}</h2>
          {description ? (
            <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-white/85">
              {description}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="border-white/0 bg-white text-primary hover:bg-white/90"
            >
              <Link href={cta.primary.href}>{cta.primary.label}</Link>
            </Button>
            {cta.secondary ? (
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="border border-white/30 text-white hover:bg-white/10"
              >
                <Link href={cta.secondary.href}>{cta.secondary.label}</Link>
              </Button>
            ) : null}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { m } from "framer-motion";
import { DISTANCE, MOTION, VIEWPORT_ONCE } from "@/lib/ui/motion";
import { Button } from "@/components/ui/button";

type CTA = { label: string; href: string };

type Props = {
  title: ReactNode;
  description?: string;
  cta: { primary: CTA; secondary?: CTA };
};

export function CTABlock({ title, description, cta }: Props) {
  const initial = { opacity: 0, y: DISTANCE.rise };
  const whileInView = { opacity: 1, y: 0 };
  const transition = MOTION.section;

  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4">
        <m.div
          initial={initial}
          whileInView={whileInView}
          viewport={VIEWPORT_ONCE}
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
            <Button asChild variant="inverted" size="lg">
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
        </m.div>
      </div>
    </section>
  );
}

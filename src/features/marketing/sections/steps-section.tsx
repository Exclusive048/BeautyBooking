"use client";

import type { ReactNode } from "react";
import { m } from "framer-motion";
import { DISTANCE, MOTION, STAGGER, VIEWPORT_ONCE } from "@/lib/ui/motion";
import { SectionHeader } from "@/features/marketing/sections/section-header";

export type Step = {
  title: string;
  description: string;
};

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  steps: ReadonlyArray<Step>;
  /** Override desktop column count. Auto-detected from steps.length when omitted (5 → 5 cols, else 4). */
  columns?: 4 | 5;
};

export function StepsSection({ eyebrow, title, description, steps, columns }: Props) {
  const cols = columns ?? (steps.length === 5 ? 5 : 4);
  // Both class strings are static literals so Tailwind JIT picks them up.
  const gridClass = cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <section className="bg-bg-card/50 py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} />
        <ol className={`mt-12 grid gap-10 md:grid-cols-2 ${gridClass}`}>
          {steps.map((step, idx) => {
            const initial = { opacity: 0, y: DISTANCE.rise };
            const whileInView = { opacity: 1, y: 0 };
            const transition = { ...MOTION.section, delay: idx * STAGGER };
            return (
              <m.li
                key={step.title}
                initial={initial}
                whileInView={whileInView}
                viewport={VIEWPORT_ONCE}
                transition={transition}
              >
                <div className="mb-4 font-display text-5xl leading-none text-accent-text/25">
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <h3 className="mb-2 font-display text-xl text-text-main">{step.title}</h3>
                <p className="leading-relaxed text-text-sec">{step.description}</p>
              </m.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

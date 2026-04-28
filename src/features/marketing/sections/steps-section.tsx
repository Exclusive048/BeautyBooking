"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

export function StepsSection({ eyebrow, title, description, steps }: Props) {
  const reduce = useReducedMotion();
  return (
    <section className="bg-bg-card/50 py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} />
        <ol className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, idx) => {
            const initial = reduce ? undefined : { opacity: 0, y: 18 };
            const whileInView = reduce ? undefined : { opacity: 1, y: 0 };
            const transition = reduce
              ? undefined
              : { duration: 0.45, ease: EASE, delay: idx * 0.06 };
            return (
              <motion.li
                key={step.title}
                initial={initial}
                whileInView={whileInView}
                viewport={{ once: true, margin: "-80px" }}
                transition={transition}
              >
                <div className="mb-4 font-display text-5xl leading-none text-primary/25">
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <h3 className="mb-2 font-display text-xl text-text-main">{step.title}</h3>
                <p className="leading-relaxed text-text-sec">{step.description}</p>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { SectionHeader } from "@/features/marketing/sections/section-header";

export type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  features: ReadonlyArray<Feature>;
  /** Default 3-column on lg, falls back to 2 on md, 1 on mobile. */
  columns?: 2 | 3;
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

export function FeatureGrid({ eyebrow, title, description, features, columns = 3 }: Props) {
  const reduce = useReducedMotion();
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} />
        <div
          className={
            "mt-12 grid gap-x-8 gap-y-12 md:grid-cols-2 " +
            (columns === 3 ? "lg:grid-cols-3" : "")
          }
        >
          {features.map((feature, idx) => (
            <FeatureCard key={feature.title} {...feature} index={idx} reduce={reduce} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  index,
  reduce,
}: Feature & { index: number; reduce: boolean | null }) {
  const initial = reduce ? undefined : { opacity: 0, y: 20 };
  const whileInView = reduce ? undefined : { opacity: 1, y: 0 };
  const transition = reduce
    ? undefined
    : { duration: 0.45, ease: EASE, delay: index * 0.05 };

  return (
    <motion.div
      initial={initial}
      whileInView={whileInView}
      viewport={{ once: true, margin: "-80px" }}
      transition={transition}
    >
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-brand-gradient">
        <Icon className="h-6 w-6 text-white" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="mb-2 font-display text-xl text-text-main">{title}</h3>
      <p className="leading-relaxed text-text-sec">{description}</p>
    </motion.div>
  );
}

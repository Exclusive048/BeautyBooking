"use client";

import { Search, CalendarCheck, Sparkles } from "lucide-react";
import { m } from "framer-motion";
import { HOVER_LIFT } from "@/components/ui/motion-classes";
import { cn } from "@/lib/cn";
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

export function HowItWorksSection() {
  const T = UI_TEXT.homeGuest.howItWorks;
  const container = containerVariants;
  const item = itemVariants;
  const steps = [
    { icon: Search, title: T.step1Title, desc: T.step1Text },
    { icon: CalendarCheck, title: T.step2Title, desc: T.step2Text },
    { icon: Sparkles, title: T.step3Title, desc: T.step3Text },
  ];

  return (
    <m.section
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      className="mx-auto max-w-6xl px-4 py-16 sm:py-20"
    >
      <m.div variants={item} className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-text-main sm:text-4xl">
          {T.title}{" "}
          <em className="font-display font-normal italic text-accent-text">{T.titleAccent}</em>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-text-sec">{T.subtitle}</p>
      </m.div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <m.div key={step.title} variants={item}>
              {/* Подъём на hover — классом на вложенном элементе: на `m.div`
                  его перебил бы inline-transform появления. */}
              <div
                className={cn(
                  "relative flex h-full flex-col items-center gap-5 rounded-2xl bg-bg-card p-8 text-center shadow-card",
                  HOVER_LIFT,
                )}
              >
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 font-mono text-xs font-semibold tabular-nums text-white">
                  {index + 1}
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-accent-text">
                  <Icon className="h-8 w-8" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-text-main">{step.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-sec">{step.desc}</p>
                </div>
              </div>
            </m.div>
          );
        })}
      </div>
    </m.section>
  );
}

"use client";

import { Search, CalendarCheck, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/ui/text";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function HowItWorksSection() {
  const T = UI_TEXT.homeGuest.howItWorks;
  const steps = [
    { icon: Search, title: T.step1Title, desc: T.step1Text },
    { icon: CalendarCheck, title: T.step2Title, desc: T.step2Text },
    { icon: Sparkles, title: T.step3Title, desc: T.step3Text },
  ];

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="mx-auto max-w-6xl px-4 py-16 sm:py-20"
    >
      <motion.div variants={itemVariants} className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-text-main sm:text-4xl">
          {T.title}{" "}
          <em className="font-display font-normal italic text-primary">{T.titleAccent}</em>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-text-sec">{T.subtitle}</p>
      </motion.div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.title}
              variants={itemVariants}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              className="relative flex flex-col items-center gap-5 rounded-2xl bg-bg-card p-8 text-center shadow-card"
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 font-mono text-xs font-semibold tabular-nums text-white">
                {index + 1}
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-8 w-8" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-lg font-semibold text-text-main">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-text-sec">{step.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

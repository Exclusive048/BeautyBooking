"use client";

import { Search, CalendarCheck, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/ui/text";

const steps = [
  {
    icon: Search,
    title: UI_TEXT.home.howItWorks.step1Title,
    desc: UI_TEXT.home.howItWorks.step1Desc,
  },
  {
    icon: CalendarCheck,
    title: UI_TEXT.home.howItWorks.step2Title,
    desc: UI_TEXT.home.howItWorks.step2Desc,
  },
  {
    icon: CheckCircle2,
    title: UI_TEXT.home.howItWorks.step3Title,
    desc: UI_TEXT.home.howItWorks.step3Desc,
  },
];

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
  return (
    <section className="space-y-6">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="text-center"
      >
        <motion.h2 variants={itemVariants} className="text-2xl font-bold text-text-main sm:text-3xl">
          {UI_TEXT.home.howItWorks.title}
        </motion.h2>
        <motion.p variants={itemVariants} className="mt-1.5 text-sm text-text-sec sm:text-base">
          {UI_TEXT.home.howItWorks.subtitle}
        </motion.p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={index}
              variants={itemVariants}
              className="relative flex flex-col items-center gap-4 rounded-[24px] border border-border-subtle/60 bg-bg-card/80 p-6 text-center sm:p-7"
            >
              {/* Step number */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full border border-border-subtle/80 bg-bg-page px-3 py-0.5 text-xs font-semibold tabular-nums text-text-sec">
                {index + 1}
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </div>

              <div>
                <p className="text-base font-semibold text-text-main">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-sec">{step.desc}</p>
              </div>

              {/* Connector arrow — only between steps on desktop */}
              {index < steps.length - 1 ? (
                <div
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-border-subtle/60 sm:block"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

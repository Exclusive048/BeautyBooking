"use client";

import { useEffect, useRef, useState } from "react";
import { Shield, Smartphone, RefreshCcw } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { UI_TEXT } from "@/lib/ui/text";

type StatItem = {
  value: number;
  suffix: string;
  label: string;
};

const STATS: StatItem[] = [
  { value: 2000, suffix: "+", label: UI_TEXT.home.trust.masters },
  { value: 15000, suffix: "+", label: UI_TEXT.home.trust.bookings },
  { value: 4.8, suffix: "", label: UI_TEXT.home.trust.rating },
  { value: 20, suffix: "+", label: UI_TEXT.home.trust.categories },
];

const USPS = [
  {
    icon: Shield,
    title: UI_TEXT.home.trust.usp1Title,
    desc: UI_TEXT.home.trust.usp1Desc,
  },
  {
    icon: Smartphone,
    title: UI_TEXT.home.trust.usp2Title,
    desc: UI_TEXT.home.trust.usp2Desc,
  },
  {
    icon: RefreshCcw,
    title: UI_TEXT.home.trust.usp3Title,
    desc: UI_TEXT.home.trust.usp3Desc,
  },
];

function AnimatedCounter({ value, suffix, label }: StatItem) {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const isFloat = !Number.isInteger(value);

  useEffect(() => {
    if (!inView) return;
    const duration = 1200;
    const steps = 40;
    const interval = duration / steps;
    let step = 0;
    const timer = window.setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(parseFloat((eased * value).toFixed(isFloat ? 1 : 0)));
      if (step >= steps) {
        setDisplayed(value);
        window.clearInterval(timer);
      }
    }, interval);
    return () => window.clearInterval(timer);
  }, [inView, value, isFloat]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-1 px-4 text-center first:pl-0 last:pr-0">
      <div className="text-3xl font-bold tabular-nums text-text-main sm:text-4xl">
        {isFloat ? displayed.toFixed(1) : Math.round(displayed).toLocaleString("ru-RU")}
        {suffix}
      </div>
      <div className="text-xs text-text-sec sm:text-sm">{label}</div>
    </div>
  );
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function TrustSection() {
  return (
    <section className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        className="text-center"
      >
        <h2 className="text-2xl font-bold text-text-main sm:text-3xl">
          {UI_TEXT.home.trust.title}
        </h2>
      </motion.div>

      {/* Counters */}
      <div className="flex flex-wrap items-center justify-center gap-0 divide-x divide-border-subtle/60">
        {STATS.map((stat) => (
          <AnimatedCounter key={stat.label} {...stat} />
        ))}
      </div>

      {/* USPs */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {USPS.map((usp) => {
          const Icon = usp.icon;
          return (
            <motion.div
              key={usp.title}
              variants={itemVariants}
              className="flex flex-col gap-3 rounded-[20px] border border-border-subtle/60 bg-bg-card/80 p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-main">{usp.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-sec">{usp.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

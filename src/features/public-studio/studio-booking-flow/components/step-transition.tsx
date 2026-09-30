"use client";

import { AnimatePresence, m, type Variants } from "framer-motion";
import { MOTION } from "@/lib/ui/motion";
import type { ReactNode } from "react";
import type { WizardStep } from "./steps-bar";

type Props = {
  step: WizardStep;
  direction: number;
  children: ReactNode;
};

/**
 * Wrapper that animates step transitions inside the wizard. Direction
 * is +1 for forward, -1 for back — exit/enter slide in the matching
 * direction, opacity crossfades. Uses framer-motion's
 * `AnimatePresence mode="wait"` so two steps never render at once.
 */
const variants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 24 : -24,
  }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -24 : 24,
  }),
};

export function StepTransition({ step, direction, children }: Props) {
  return (
    <AnimatePresence mode="wait" custom={direction} initial={false}>
      <m.div
        key={step}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={MOTION.base}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

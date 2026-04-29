"use client";

import { type ReactNode, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

type Props = {
  /** Stable slug used to build #faq-{id} anchor and as React key. */
  id: string;
  question: string;
  /** Plain text or JSX. Plain text is wrapped in <p>; JSX is rendered as-is. */
  answer: ReactNode;
};

/**
 * Standalone FAQ accordion item used on /faq.
 *
 * Intentionally separate from `<FAQAccordionItem>` in `src/components/ui/faq-accordion.tsx`
 * — that one is wrapped in a `lux-card` and used on the homepage and /help/masters,
 * which we don't want to disturb. This one is unstyled-on-the-outside (just a
 * border) so a long list of questions reads as a flowing document, not stacked cards.
 */
export function FAQItem({ id, question, answer }: Props) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div
      id={`faq-${id}`}
      className="scroll-mt-20 overflow-hidden rounded-xl border border-border-subtle bg-bg-card/50 transition-colors hover:border-primary/30"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
        aria-expanded={open}
        aria-controls={`faq-panel-${id}`}
      >
        <span className="font-medium text-text-main">{question}</span>
        <motion.span
          animate={reduce ? undefined : { rotate: open ? 180 : 0 }}
          transition={reduce ? undefined : { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="shrink-0 text-text-sec"
          aria-hidden
        >
          <ChevronDown className="h-5 w-5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            id={`faq-panel-${id}`}
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 leading-relaxed text-text-sec">
              {typeof answer === "string" ? <p>{answer}</p> : answer}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

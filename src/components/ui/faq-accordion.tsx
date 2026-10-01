"use client";

import { useState } from "react";
import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import { INSTANT, MOTION } from "@/lib/ui/motion";
import { ChevronDown } from "lucide-react";

export type FAQItem = { readonly q: string; readonly a: string };
export type FAQGroup = { readonly title: string; readonly items: readonly FAQItem[] };

function FAQAccordionItem({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div className="lux-card rounded-2xl bg-bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 p-5 text-left font-medium text-sm text-text-main"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{item.q}</span>
        <m.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={MOTION.micro}
          className="shrink-0 text-text-sec"
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="content"
            // Раскрытие по высоте `reducedMotion="user"` не гасит (это не transform) —
            // тем, кто просил не двигать интерфейс, ответ появляется сразу.
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: reduce ? INSTANT : MOTION.exit }}
            transition={reduce ? INSTANT : MOTION.base}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{item.a}</p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { FAQAccordionItem };

export function FAQAccordion({ groups }: { groups: readonly FAQGroup[] }) {
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          {group.title && <h2 className="text-lg font-semibold text-text-main">{group.title}</h2>}
          {group.items.map((item) => (
            <FAQAccordionItem key={item.q} item={item} />
          ))}
        </section>
      ))}
    </div>
  );
}

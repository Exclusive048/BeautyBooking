"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

export type FAQItem = { readonly q: string; readonly a: string };
export type FAQGroup = { readonly title: string; readonly items: readonly FAQItem[] };

function FAQAccordionItem({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lux-card rounded-[16px] bg-bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 p-5 text-left font-medium text-sm text-text-main"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{item.q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="shrink-0 text-text-sec"
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{item.a}</p>
          </motion.div>
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

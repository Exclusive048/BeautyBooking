"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";

type Category = {
  id: string;
  title: string;
  slug: string | null;
  icon: string | null;
  usageCount: number;
};

const LIMIT = 8;

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function PopularCategoriesSection() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/catalog/global-categories?status=APPROVED", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ categories: Category[] } | Category[]>
          | null;
        if (!res.ok || !json || !json.ok) return;
        const payload = Array.isArray(json.data) ? json.data : (json.data?.categories ?? []);
        if (!cancelled) {
          setCategories(
            payload
              .filter((c) => !c.slug || !c.slug.includes("/"))
              .slice(0, LIMIT)
          );
        }
      } catch {
        // silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (categories.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-main sm:text-3xl">
            {UI_TEXT.home.categories.title}
          </h2>
          <p className="mt-1 text-sm text-text-sec sm:text-base">
            {UI_TEXT.home.categories.subtitle}
          </p>
        </div>
        <Link
          href="/catalog"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          {UI_TEXT.home.categories.showAll}
        </Link>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {categories.map((cat) => (
          <motion.div key={cat.id} variants={itemVariants}>
            <Link
              href={`/catalog?category=${cat.slug ?? cat.id}`}
              className="group flex flex-col items-center gap-3 rounded-[20px] border border-border-subtle/60 bg-bg-card/80 p-4 text-center transition-colors hover:border-primary/30 hover:bg-primary/5 sm:p-5"
            >
              {cat.icon ? (
                <span className="text-3xl" aria-hidden>
                  {cat.icon}
                </span>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary text-base font-bold">
                  {cat.title.charAt(0)}
                </div>
              )}
              <span className="text-sm font-medium leading-tight text-text-main group-hover:text-primary">
                {cat.title}
              </span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

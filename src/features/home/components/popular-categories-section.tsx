"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { buildCatalogUrl } from "@/features/catalog/lib/catalog-url";
import { fetchJson } from "@/lib/http/client";
import { DISTANCE, MOTION, STAGGER, VIEWPORT_ONCE } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

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
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.94, y: DISTANCE.rise },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: MOTION.section,
  },
};

export function PopularCategoriesSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const container = containerVariants;
  const item = itemVariants;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<{ categories: Category[] } | Category[]>(
          "/api/catalog/global-categories?status=APPROVED",
          { cache: "no-store" },
        );
        const payload = Array.isArray(data) ? data : (data?.categories ?? []);
        if (!cancelled) {
          setCategories(
            payload
              .filter((c) => !c.slug || !c.slug.includes("/"))
              .slice(0, LIMIT)
          );
        }
      } catch {
        // Витрина главной: без категорий блок просто не показывается.
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
          className="shrink-0 text-sm font-medium text-accent-text hover:underline"
        >
          {UI_TEXT.home.categories.showAll}
        </Link>
      </div>

      <m.div
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT_ONCE}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {categories.map((cat) => (
          <m.div key={cat.id} variants={item}>
            <Link
              href={buildCatalogUrl({ globalCategoryId: cat.id })}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-border-subtle/60 bg-bg-card/80 p-4 text-center transition-colors hover:border-primary/30 hover:bg-primary/5 sm:p-5"
            >
              {cat.icon ? (
                <span className="text-3xl" aria-hidden>
                  {cat.icon}
                </span>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-accent-text text-base font-bold">
                  {cat.title.charAt(0)}
                </div>
              )}
              <span className="text-sm font-medium leading-tight text-text-main group-hover:text-accent-text">
                {cat.title}
              </span>
            </Link>
          </m.div>
        ))}
      </m.div>
    </section>
  );
}

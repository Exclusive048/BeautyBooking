"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/features/marketing/sections/section-header";

export type PricingPlan = {
  /** Internal tier code — also rendered as the small uppercased label. */
  tier: "FREE" | "PRO" | "PREMIUM";
  /** Russian display name (e.g. "Старт", "Профи", "Студия"). */
  name: string;
  /** Price string. Use "[Уточняется]" placeholder if not finalised. */
  price: string;
  /** Right-of-price suffix, e.g. "в месяц" or "навсегда". */
  priceNote?: string;
  description: string;
  features: ReadonlyArray<string>;
  /** Visually highlighted plan — gets the brand-gradient background. */
  highlighted?: boolean;
};

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  plans: ReadonlyArray<PricingPlan>;
  ctaHref: string;
  ctaLabel: string;
  fullPricingHref: string;
  fullPricingLabel: string;
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

export function PricingTeaser({
  eyebrow,
  title,
  description,
  plans,
  ctaHref,
  ctaLabel,
  fullPricingHref,
  fullPricingLabel,
}: Props) {
  const reduce = useReducedMotion();

  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          align="center"
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((plan, idx) => {
            const initial = reduce ? undefined : { opacity: 0, y: 20 };
            const whileInView = reduce ? undefined : { opacity: 1, y: 0 };
            const transition = reduce
              ? undefined
              : { duration: 0.45, ease: EASE, delay: idx * 0.05 };

            return (
              <motion.div
                key={plan.tier}
                initial={initial}
                whileInView={whileInView}
                viewport={{ once: true, margin: "-80px" }}
                transition={transition}
                className={
                  plan.highlighted
                    ? "rounded-2xl bg-brand-gradient p-8 text-white shadow-card"
                    : "rounded-2xl border border-border-subtle bg-bg-card/50 p-8"
                }
              >
                <p
                  className={
                    plan.highlighted
                      ? "mb-2 font-mono text-xs font-medium uppercase tracking-[0.18em] text-white/85"
                      : "mb-2 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary"
                  }
                >
                  {plan.tier}
                </p>
                <h3
                  className={
                    plan.highlighted
                      ? "mb-1 font-display text-2xl text-white"
                      : "mb-1 font-display text-2xl text-text-main"
                  }
                >
                  {plan.name}
                </h3>
                <p
                  className={
                    plan.highlighted
                      ? "mb-6 text-sm leading-relaxed text-white/80"
                      : "mb-6 text-sm leading-relaxed text-text-sec"
                  }
                >
                  {plan.description}
                </p>

                <div className="mb-6">
                  <span
                    className={
                      plan.highlighted
                        ? "font-display text-4xl text-white"
                        : "font-display text-4xl text-text-main"
                    }
                  >
                    {plan.price}
                  </span>
                  {plan.priceNote ? (
                    <span
                      className={
                        plan.highlighted
                          ? "ml-2 text-sm text-white/80"
                          : "ml-2 text-sm text-text-sec"
                      }
                    >
                      {plan.priceNote}
                    </span>
                  ) : null}
                </div>

                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check
                        className={
                          plan.highlighted
                            ? "mt-0.5 h-4 w-4 shrink-0 text-white"
                            : "mt-0.5 h-4 w-4 shrink-0 text-primary"
                        }
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span
                        className={plan.highlighted ? "text-white/95" : "text-text-main"}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href={fullPricingHref}>{fullPricingLabel}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

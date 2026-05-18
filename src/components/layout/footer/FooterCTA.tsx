"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const MASTERS_HREF = "/become-master";
const MODELS_HREF = "/models";

type CardCopy = {
  badge: string;
  title: string;
  subtitle: string;
  metric1Value: string;
  metric1Label: string;
  metric2Value: string;
  metric2Label: string;
  cta: string;
};

type CardTone = "brand" | "soft";

/**
 * FOOTER-REDESIGN-A: two CTAs side-by-side replacing the single
 * brand-aspirational card. One brand-gradient «Для мастеров» card
 * funnels providers into onboarding (`/become-master`); one soft
 * «Для моделей» card surfaces the existing model-offers marketplace
 * (`/models`). Both use shared `<Button>` and project tokens; the
 * metrics displayed are presentational marketing values (no live
 * data source today — backlog: «real CTA metrics» if surfacing
 * actual figures becomes valuable).
 *
 * Mobile: stack vertically. Desktop: 2-col grid on `lg+`.
 */
export function FooterCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="grid gap-5 lg:grid-cols-2"
    >
      <CTACard
        tone="brand"
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
        copy={UI_TEXT.footer.ctaMasters}
        href={MASTERS_HREF}
      />
      <CTACard
        tone="soft"
        icon={<Heart className="h-4 w-4" aria-hidden />}
        copy={UI_TEXT.footer.ctaModels}
        href={MODELS_HREF}
      />
    </motion.div>
  );
}

function CTACard({
  tone,
  icon,
  copy,
  href,
}: {
  tone: CardTone;
  icon: React.ReactNode;
  copy: CardCopy;
  href: string;
}) {
  const isBrand = tone === "brand";
  return (
    <div
      className={cn(
        "relative flex flex-col gap-5 overflow-hidden rounded-3xl border p-6 md:p-8",
        isBrand
          ? "border-transparent bg-brand-gradient text-white shadow-brand"
          : "border-border-subtle bg-bg-elevated text-text-main",
      )}
    >
      {/* Decorative accent — only on brand card, subtle */}
      {isBrand ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
        >
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white blur-3xl" />
        </div>
      ) : null}

      <div className="relative space-y-2">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider",
            isBrand
              ? "border-white/25 bg-white/10 text-white"
              : "border-primary/25 bg-primary/10 text-primary",
          )}
        >
          {icon}
          <span>{copy.badge}</span>
        </div>
        <h2
          className={cn(
            "font-display text-xl font-semibold leading-tight tracking-tight md:text-2xl",
            isBrand ? "text-white" : "text-text-main",
          )}
        >
          {copy.title}
        </h2>
        <p
          className={cn(
            "max-w-md text-sm leading-relaxed",
            isBrand ? "text-white/85" : "text-text-sec",
          )}
        >
          {copy.subtitle}
        </p>
      </div>

      <div className="relative flex flex-wrap gap-x-6 gap-y-3 pt-1">
        <Metric value={copy.metric1Value} label={copy.metric1Label} isBrand={isBrand} />
        <Metric value={copy.metric2Value} label={copy.metric2Label} isBrand={isBrand} />
      </div>

      <div className="relative mt-auto">
        <Button
          asChild
          variant={isBrand ? "secondary" : "primary"}
          size="md"
          className={cn(
            "inline-flex items-center gap-1.5",
            isBrand && "bg-white text-primary hover:bg-white/90",
          )}
        >
          <Link href={href}>
            {copy.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  isBrand,
}: {
  value: string;
  label: string;
  isBrand: boolean;
}) {
  return (
    <div className="min-w-[120px]">
      <div
        className={cn(
          "font-display text-2xl font-semibold tabular-nums",
          isBrand ? "text-white" : "text-text-main",
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "text-xs",
          isBrand ? "text-white/75" : "text-text-sec",
        )}
      >
        {label}
      </div>
    </div>
  );
}

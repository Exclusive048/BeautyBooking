import type { Metadata } from "next";
import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.pricing.title,
  description: UI_TEXT.pages.pricing.description,
};

type Plan = {
  code: string;
  name: string;
  price: string;
  period: string;
  badge?: string;
  badgeColor?: string;
  desc: string;
  features: readonly string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
};

const MASTER_PLANS = UI_TEXT.pages.pricing.plans.master as readonly Plan[];
const STUDIO_PLANS = UI_TEXT.pages.pricing.plans.studio as readonly Plan[];
const PRICING_FAQ = UI_TEXT.pages.pricing.faqItems;

function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`lux-card rounded-[24px] bg-bg-card p-7 flex flex-col gap-5 relative ${plan.highlight ? "ring-2 ring-primary/40" : ""}`}
    >
      {plan.badge && (
        <div className={`absolute -top-3 left-6 rounded-full bg-gradient-to-r ${plan.badgeColor} px-3 py-1 text-xs font-semibold text-white shadow-sm`}>
          {plan.badge}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-bold text-text-sec tracking-widest uppercase">{plan.name}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black text-text-main">{plan.price}</span>
          <span className="text-sm text-text-sec">{plan.period}</span>
        </div>
        <p className="text-sm text-text-sec">{plan.desc}</p>
      </div>

      <ul className="space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-text-sec">
            <span className="text-primary mt-0.5 shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={plan.ctaHref}
        className={`w-full inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-all ${
          plan.highlight
            ? "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-white shadow-card hover:brightness-105"
            : "border border-border-subtle bg-bg-input text-text-main hover:bg-bg-card"
        }`}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12 md:py-20 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          {UI_TEXT.pages.pricing.heroBadge}
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main tracking-tight">
          {UI_TEXT.pages.pricing.heroTitleMain}{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            {UI_TEXT.pages.pricing.heroTitleHighlight}
          </span>
        </h1>
        <p className="text-text-sec text-lg max-w-[480px] mx-auto">
          {UI_TEXT.pages.pricing.heroSubtitle}
        </p>
      </section>

      {/* Master plans */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.pricing.masterTitle}</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {MASTER_PLANS.map((plan) => (
            <PricingCard key={plan.code} plan={plan} />
          ))}
        </div>
      </section>

      {/* Studio plans */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.pricing.studioTitle}</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {STUDIO_PLANS.map((plan) => (
            <PricingCard key={plan.code} plan={plan} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-5 max-w-[720px] mx-auto">
        <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.pricing.faqTitle}</h2>
        <div className="space-y-3">
          {PRICING_FAQ.map(([q, a]) => (
            <details key={q} className="lux-card rounded-[16px] bg-bg-card group">
              <summary className="flex items-center justify-between cursor-pointer p-5 font-medium text-sm text-text-main list-none">
                {q}
                <span className="ml-4 shrink-0 text-text-sec group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}


import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { FAQItem } from "@/features/faq/components/faq-item";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { PlanCard } from "@/features/pricing/components/plan-card";
import {
  PricingTabsClient,
  type PricingScope,
} from "@/features/pricing/components/pricing-tabs-client";
import { TrialPromoBlock } from "@/features/pricing/components/trial-promo-block";
import { getMarketingPricing } from "@/lib/billing/marketing-pricing";
import { getCurrentSubscriptionRow } from "@/lib/billing/get-current-subscription-row";
import { getSessionUserId } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Тарифы — МастерРядом",
  description:
    "Подписка вместо комиссий. Тарифы для мастеров и студий — выберите план под свою нагрузку.",
  alternates: { canonical: "/pricing" },
};

const T = UI_TEXT.pricing;

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

function parseScope(value: string | undefined): PricingScope {
  return value === "studio" ? "studio" : "master";
}

export default async function PricingPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const activeTab = parseScope(tab);
  const pricing = await getMarketingPricing();

  const deck = activeTab === "studio" ? pricing.studio : pricing.master;
  const scopeUpper = activeTab === "studio" ? "STUDIO" : "MASTER";

  // Hide the trial promo for users who already have any active subscription
  // on this scope — trial / free / paid alike. Anonymous and users without
  // a profile on this scope still see the promo and can act on it.
  const userId = await getSessionUserId();
  const currentSub = userId ? await getCurrentSubscriptionRow(userId, scopeUpper) : null;
  const showTrialPromo = !currentSub;

  return (
    <MarketingLayout>
      {/* Hero with brand-language italic accent — same atmosphere as /faq, /help. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/8 blur-3xl dark:bg-primary/12"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary-magenta/8 blur-3xl dark:bg-primary-magenta/12"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-12 text-center lg:py-16">
          <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {T.hero.eyebrow}
          </p>
          <h1 className="mb-4 font-display text-3xl leading-[1.1] text-text-main lg:text-5xl">
            {T.hero.titleBefore}{" "}
            <em className="font-display font-normal italic text-primary">{T.hero.titleItalic}</em>
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-text-sec">
            {T.hero.description}
          </p>

          <div className="flex justify-center">
            <Suspense fallback={null}>
              <PricingTabsClient
                active={activeTab}
                items={[
                  { id: "master", label: T.tabs.master },
                  { id: "studio", label: T.tabs.studio },
                ]}
              />
            </Suspense>
          </div>
        </div>
      </section>

      {/* 3 plan cards — `key={activeTab}` forces a fresh subtree on tab switch
          so any client-side state (none today, but future-proof) doesn't leak. */}
      <section key={activeTab} className="mx-auto max-w-[1280px] px-4 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          <PlanCard plan={deck.free} fallbackCode={`${scopeUpper}_FREE`} />
          <PlanCard plan={deck.pro} fallbackCode={`${scopeUpper}_PRO`} highlighted />
          <PlanCard plan={deck.premium} fallbackCode={`${scopeUpper}_PREMIUM`} />
        </div>
      </section>

      {/* Trial promo — shown to anonymous users and to logged-in users who
          have no subscription yet for this scope (i.e. haven't onboarded as
          master/studio yet). Hidden for users with any existing subscription
          to avoid over-promising what they can't claim a second time. */}
      {showTrialPromo ? <TrialPromoBlock scope={activeTab} /> : null}

      {/* FAQ — reuses <FAQItem> from /faq for visual continuity. */}
      <section className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="mb-5 font-display text-2xl text-text-main lg:text-3xl">{T.faq.title}</h2>
        <div className="space-y-3">
          {T.faq.items.map((item) => (
            <FAQItem
              key={item.id}
              id={`pricing-${item.id}`}
              question={item.question}
              answer={item.answer}
            />
          ))}
        </div>
      </section>

      {/* Final CTA — calm, no brand-gradient (utility page). */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <h2 className="mb-3 font-display text-2xl text-text-main lg:text-3xl">
          {T.finalCta.title}
        </h2>
        <p className="mx-auto mb-6 max-w-xl leading-relaxed text-text-sec">
          {T.finalCta.description}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href="/login">{T.finalCta.primary}</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/become-master">{T.finalCta.secondary}</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}

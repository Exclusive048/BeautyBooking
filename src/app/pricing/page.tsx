import type { Metadata } from "next";
import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveFeatures, type PlanNode } from "@/lib/billing/features";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";
import type { SubscriptionScope } from "@prisma/client";

export const metadata: Metadata = {
  title: UI_TEXT.pages.pricing.title,
  description: UI_TEXT.pages.pricing.description,
};

type PlanCard = {
  code: string;
  name: string;
  price: string;
  period: string;
  badge?: string;
  badgeColor?: string;
  desc: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
};

const t = UI_TEXT.pages.pricing;

const PRICING_FEATURE_KEYS: FeatureKey[] = [
  "onlineBooking",
  "catalogListing",
  "profilePublicPage",
  "pwaPush",
  "notifications",
  "onlinePayments",
  "tgNotifications",
  "clientVisitHistory",
  "clientNotes",
  "financeReport",
  "hotSlots",
  "highlightCard",
  "analytics_dashboard",
  "analytics_revenue",
  "analytics_clients",
  "analytics_booking_insights",
  "analytics_cohorts",
  "analytics_forecast",
];

function formatPrice(kopeks: number): string {
  const rub = kopeks / 100;
  return `${rub.toLocaleString("ru-RU")} ₽`;
}

function buildFeatureList(
  features: Record<string, boolean | number | null>,
  scope: SubscriptionScope,
  parentName: string | null
): string[] {
  const lines: string[] = [];

  if (parentName) {
    lines.push(t.inheritPrefix.replace("{parent}", parentName));
  }

  if (scope === "STUDIO" && typeof features.maxTeamMasters === "number") {
    lines.push(t.teamMastersLabel.replace("{count}", String(features.maxTeamMasters)));
  }

  if (scope === "MASTER" && typeof features.maxPortfolioPhotosSolo === "number") {
    lines.push(t.portfolioLabel.replace("{count}", String(features.maxPortfolioPhotosSolo)));
  }

  if (scope === "STUDIO" && typeof features.maxPortfolioPhotosStudioDesign === "number" && typeof features.maxPortfolioPhotosPerStudioMaster === "number") {
    lines.push(
      t.portfolioStudioLabel
        .replace("{count}", String(features.maxPortfolioPhotosStudioDesign))
        .replace("{perMaster}", String(features.maxPortfolioPhotosPerStudioMaster))
    );
  }

  for (const key of PRICING_FEATURE_KEYS) {
    if (!features[key]) continue;
    const def = FEATURE_CATALOG[key];
    if (def.appliesTo !== "BOTH" && def.appliesTo !== scope) continue;
    lines.push(def.title);
  }

  return lines;
}

async function loadPlans(): Promise<{ master: PlanCard[]; studio: PlanCard[] }> {
  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      sortOrder: true,
      inheritsFromPlanId: true,
      features: true,
      prices: {
        where: { isActive: true, periodMonths: 1 },
        select: { priceKopeks: true },
      },
    },
  });

  const planMap = new Map<string, PlanNode>(
    plans.map((p) => [p.id, { id: p.id, inheritsFromPlanId: p.inheritsFromPlanId, features: p.features }])
  );

  const parentNameById = new Map<string, string>();
  for (const p of plans) {
    parentNameById.set(p.id, p.name);
  }

  const grouped: Record<SubscriptionScope, PlanCard[]> = { MASTER: [], STUDIO: [] };

  for (const plan of plans) {
    const resolved = resolveEffectiveFeatures(plan.id, planMap);
    const monthlyPrice = plan.prices[0]?.priceKopeks ?? 0;
    const meta = t.planMeta[plan.code] ?? {};

    const parentName = plan.inheritsFromPlanId
      ? parentNameById.get(plan.inheritsFromPlanId) ?? null
      : null;

    const featureLines = buildFeatureList(
      resolved as unknown as Record<string, boolean | number | null>,
      plan.scope,
      parentName
    );

    const extraFeatures = (meta as { extraFeatures?: string[] }).extraFeatures ?? [];

    const allFeatures = parentName
      ? [featureLines[0], ...extraFeatures, ...featureLines.slice(1)]
      : [...extraFeatures, ...featureLines];

    grouped[plan.scope].push({
      code: plan.code,
      name: plan.name,
      price: formatPrice(monthlyPrice),
      period: monthlyPrice === 0 ? t.freePeriod : t.paidPeriod,
      badge: (meta as { badge?: string }).badge,
      badgeColor: (meta as { badgeColor?: string }).badgeColor,
      desc: (meta as { desc?: string }).desc ?? "",
      features: allFeatures,
      cta: (meta as { cta?: string }).cta ?? plan.name,
      ctaHref: (meta as { ctaHref?: string }).ctaHref ?? "/login",
      highlight: (meta as { highlight?: boolean }).highlight,
    });
  }

  return { master: grouped.MASTER, studio: grouped.STUDIO };
}

function PricingCard({ plan }: { plan: PlanCard }) {
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

export default async function PricingPage() {
  const { master, studio } = await loadPlans();

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12 md:py-20 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          {t.heroBadge}
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main tracking-tight">
          {t.heroTitleMain}{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            {t.heroTitleHighlight}
          </span>
        </h1>
        <p className="text-text-sec text-lg max-w-[480px] mx-auto">
          {t.heroSubtitle}
        </p>
      </section>

      {/* Master plans */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">{t.masterTitle}</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {master.map((plan) => (
            <PricingCard key={plan.code} plan={plan} />
          ))}
        </div>
      </section>

      {/* Studio plans */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">{t.studioTitle}</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {studio.map((plan) => (
            <PricingCard key={plan.code} plan={plan} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-5 max-w-[720px] mx-auto">
        <h2 className="text-xl font-semibold text-text-main">{t.faqTitle}</h2>
        <div className="space-y-3">
          {t.faqItems.map(([q, a]) => (
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

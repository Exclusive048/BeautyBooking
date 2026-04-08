import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveFeatures, type PlanNode } from "@/lib/billing/features";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";
import type { SubscriptionScope } from "@prisma/client";

export const metadata: Metadata = {
  title: UI_TEXT.pages.pricing.title,
  description: UI_TEXT.pages.pricing.description,
};

const t = UI_TEXT.pages.pricing;

// Feature keys shown in the comparison table (ordered)
const TABLE_FEATURE_KEYS: FeatureKey[] = [
  "onlineBooking",
  "catalogListing",
  "profilePublicPage",
  "pwaPush",
  "notifications",
  "onlinePayments",
  "tgNotifications",
  "hotSlots",
  "clientVisitHistory",
  "clientNotes",
  "financeReport",
  "analytics_dashboard",
  "analytics_revenue",
  "analytics_clients",
  "analytics_booking_insights",
  "analytics_forecast",
  "highlightCard",
  "clientImport",
];

type PlanData = {
  id: string;
  code: string;
  name: string;
  tier: string;
  scope: SubscriptionScope;
  sortOrder: number;
  inheritsFromPlanId: string | null;
  features: unknown;
  prices: Array<{ periodMonths: number; priceKopeks: number }>;
  resolved: Record<FeatureKey, boolean | number | null>;
  meta: {
    desc: string;
    badge?: string;
    badgeColor?: string;
    highlight?: boolean;
    cta: string;
    ctaHref: string;
    extraFeatures: string[];
  };
};

async function loadPlans(): Promise<{ master: PlanData[]; studio: PlanData[] }> {
  const raw = await prisma.billingPlan.findMany({
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
        where: { isActive: true },
        select: { periodMonths: true, priceKopeks: true },
        orderBy: { periodMonths: "asc" },
      },
    },
  });

  const planMap = new Map<string, PlanNode>(
    raw.map((p) => [p.id, { id: p.id, inheritsFromPlanId: p.inheritsFromPlanId, features: p.features }])
  );

  const grouped: Record<SubscriptionScope, PlanData[]> = { MASTER: [], STUDIO: [] };

  for (const plan of raw) {
    const resolved = resolveEffectiveFeatures(plan.id, planMap) as Record<FeatureKey, boolean | number | null>;
    const meta = (t.planMeta[plan.code] ?? {
      desc: "",
      cta: plan.name,
      ctaHref: "/login",
      extraFeatures: [],
    }) as PlanData["meta"];

    grouped[plan.scope].push({ ...plan, resolved, meta });
  }

  return { master: grouped.MASTER, studio: grouped.STUDIO };
}

function formatPrice(kopeks: number): string {
  const rub = kopeks / 100;
  return rub.toLocaleString("ru-RU");
}

function calcSavingsPct(monthlyKopeks: number, periodKopeks: number, periodMonths: number): number | null {
  if (monthlyKopeks === 0 || periodMonths === 1) return null;
  const fullPrice = monthlyKopeks * periodMonths;
  if (fullPrice === 0) return null;
  const saved = Math.round((1 - periodKopeks / fullPrice) * 100);
  return saved > 0 ? saved : null;
}

// ─── Period tab strip (client-side via URL) ─────────────────────────────────
// We render as plain links — no JS needed. Active period from searchParams.
function PeriodTabs({
  scope,
  period,
  plans,
}: {
  scope: string;
  period: number;
  plans: PlanData[];
}) {
  const periods = [1, 3, 6, 12];
  const monthlyPrices = new Map<string, number>();
  for (const plan of plans) {
    const monthly = plan.prices.find((p) => p.periodMonths === 1);
    if (monthly) monthlyPrices.set(plan.code, monthly.priceKopeks);
  }

  const periodLabels: Record<number, string> = {
    1: t.period1,
    3: t.period3,
    6: t.period6,
    12: t.period12,
  };

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border-subtle/80 bg-bg-input p-1">
      {periods.map((p) => {
        // Compute max savings across all paid plans for this period
        let maxSavings = 0;
        for (const plan of plans) {
          const monthly = monthlyPrices.get(plan.code) ?? 0;
          const pEntry = plan.prices.find((pr) => pr.periodMonths === p);
          if (pEntry) {
            const s = calcSavingsPct(monthly, pEntry.priceKopeks, p) ?? 0;
            if (s > maxSavings) maxSavings = s;
          }
        }
        const isActive = period === p;
        return (
          <Link
            key={p}
            href={`/pricing?scope=${scope}&period=${p}`}
            className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
              isActive
                ? "bg-bg-card text-text-main shadow-card"
                : "text-text-sec hover:text-text-main"
            }`}
          >
            {periodLabels[p]}
            {maxSavings > 0 && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                {t.savingsBadge.replace("{pct}", String(maxSavings))}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Plan card ───────────────────────────────────────────────────────────────
function PlanCard({ plan, period }: { plan: PlanData; period: number }) {
  const priceEntry = plan.prices.find((p) => p.periodMonths === period);
  const monthlyEntry = plan.prices.find((p) => p.periodMonths === 1);
  const priceKopeks = priceEntry?.priceKopeks ?? 0;
  const monthlyKopeks = monthlyEntry?.priceKopeks ?? 0;
  const isFree = monthlyKopeks === 0;

  const effectiveMonthly = period > 1 && !isFree ? Math.round(priceKopeks / period) : priceKopeks;
  const savings = calcSavingsPct(monthlyKopeks, priceKopeks, period);

  const limitLabel = () => {
    if (plan.scope === "STUDIO") {
      const n = plan.resolved.maxTeamMasters;
      if (typeof n === "number") return t.teamMastersLabel.replace("{count}", String(n));
    } else {
      const n = plan.resolved.maxPortfolioPhotosSolo;
      if (typeof n === "number") return t.portfolioLabel.replace("{count}", String(n));
    }
    return null;
  };

  return (
    <div
      className={`relative flex flex-col rounded-[24px] bg-bg-card p-6 ${
        plan.meta.highlight
          ? "ring-2 ring-primary/40 shadow-hover"
          : "border border-border-subtle/80 shadow-card"
      }`}
    >
      {plan.meta.badge && (
        <div
          className={`absolute -top-3 left-5 rounded-full bg-gradient-to-r ${plan.meta.badgeColor ?? "from-primary to-primary-magenta"} px-3 py-1 text-xs font-semibold text-white shadow-sm`}
        >
          {plan.meta.badge}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-text-sec">{plan.name}</p>
        <div className="flex items-baseline gap-1">
          {isFree ? (
            <span className="text-3xl font-black text-text-main">0 ₽</span>
          ) : (
            <>
              <span className="text-3xl font-black text-text-main">{formatPrice(effectiveMonthly)} ₽</span>
              <span className="text-sm text-text-sec">/мес</span>
            </>
          )}
        </div>
        {!isFree && period > 1 && (
          <p className="text-xs text-text-sec">
            {formatPrice(priceKopeks)} ₽ за {period} мес.
            {savings !== null && (
              <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">
                ({t.savingsBadge.replace("{pct}", String(savings))})
              </span>
            )}
          </p>
        )}
        {isFree && <p className="text-xs text-text-sec">{t.freePeriod}</p>}
        <p className="mt-2 text-sm text-text-sec">{plan.meta.desc}</p>
      </div>

      <ul className="mt-5 flex-1 space-y-2">
        {plan.meta.extraFeatures.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-text-sec">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {f}
          </li>
        ))}
        {limitLabel() && (
          <li className="flex items-start gap-2 text-sm text-text-sec">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {limitLabel()}
          </li>
        )}
        {TABLE_FEATURE_KEYS.map((key) => {
          const def = FEATURE_CATALOG[key];
          if (def.appliesTo !== "BOTH" && def.appliesTo !== plan.scope) return null;
          const val = plan.resolved[key];
          if (!val) return null;
          return (
            <li key={key} className="flex items-start gap-2 text-sm text-text-sec">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {def.title}
            </li>
          );
        })}
      </ul>

      <Link
        href={plan.meta.ctaHref}
        className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-all ${
          plan.meta.highlight
            ? "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-white shadow-card hover:brightness-105"
            : "border border-border-subtle bg-bg-input text-text-main hover:bg-bg-card"
        }`}
      >
        {plan.meta.cta}
      </Link>
    </div>
  );
}

// ─── Feature comparison table ────────────────────────────────────────────────
function FeatureTable({ plans, scope }: { plans: PlanData[]; scope: SubscriptionScope }) {
  const scopeKeys = TABLE_FEATURE_KEYS.filter((key) => {
    const def = FEATURE_CATALOG[key];
    return def.appliesTo === "BOTH" || def.appliesTo === scope;
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle/80">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle/60 bg-bg-card">
            <th className="py-3 pl-4 pr-2 text-left font-semibold text-text-main">
              {t.featuresSectionTitle}
            </th>
            {plans.map((plan) => (
              <th key={plan.code} className="px-4 py-3 text-center font-semibold text-text-main">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scopeKeys.map((key, i) => {
            const def = FEATURE_CATALOG[key];
            return (
              <tr
                key={key}
                className={`border-b border-border-subtle/40 ${i % 2 === 0 ? "bg-bg-page" : "bg-bg-card/50"}`}
              >
                <td className="py-2.5 pl-4 pr-2 text-text-sec">{def.title}</td>
                {plans.map((plan) => {
                  const val = plan.resolved[key];
                  const has = typeof val === "boolean" ? val : typeof val === "number" ? val > 0 : false;
                  return (
                    <td key={plan.code} className="px-4 py-2.5 text-center">
                      {has ? (
                        <Check className="mx-auto h-4 w-4 text-primary" aria-label={t.featureAvailable} />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-border-subtle" aria-label={t.featureUnavailable} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
type SearchParams = Promise<{ scope?: string; period?: string }>;

export default async function PricingPage({ searchParams }: { searchParams: SearchParams }) {
  const { master, studio } = await loadPlans();
  const params = await searchParams;

  const scope: SubscriptionScope =
    params.scope === "STUDIO" ? "STUDIO" : "MASTER";
  const period = [1, 3, 6, 12].includes(Number(params.period))
    ? Number(params.period)
    : 1;

  const plans = scope === "STUDIO" ? studio : master;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12 md:py-20 space-y-16">

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
        <p className="text-lg text-text-sec max-w-[480px] mx-auto">{t.heroSubtitle}</p>
      </section>

      {/* Controls: scope tabs + period tabs */}
      <section className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        {/* Scope */}
        <div className="flex items-center gap-1 rounded-2xl border border-border-subtle/80 bg-bg-input p-1">
          {(["MASTER", "STUDIO"] as const).map((s) => (
            <Link
              key={s}
              href={`/pricing?scope=${s}&period=${period}`}
              className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-all ${
                scope === s
                  ? "bg-bg-card text-text-main shadow-card"
                  : "text-text-sec hover:text-text-main"
              }`}
            >
              {s === "MASTER" ? t.scopeMaster : t.scopeStudio}
            </Link>
          ))}
        </div>

        {/* Period */}
        <PeriodTabs scope={scope} period={period} plans={plans} />
      </section>

      {/* Cards */}
      <section>
        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.code} plan={plan} period={period} />
          ))}
        </div>
      </section>

      {/* Feature comparison table */}
      {plans.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-main">{t.featuresSectionTitle}</h2>
          <FeatureTable plans={plans} scope={scope} />
        </section>
      )}

      {/* FAQ */}
      <section className="space-y-5 max-w-[720px] mx-auto">
        <h2 className="text-xl font-semibold text-text-main">{t.faqTitle}</h2>
        <div className="space-y-3">
          {t.faqItems.map(([q, a]) => (
            <details key={q} className="lux-card rounded-[16px] bg-bg-card group">
              <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-sm font-medium text-text-main">
                {q}
                <span className="ml-4 shrink-0 text-text-sec transition-transform group-open:rotate-180">▾</span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-text-sec">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

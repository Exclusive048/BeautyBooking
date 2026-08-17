"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import type { PlanFeatures } from "@/lib/billing/types";
import { billingUpgradeHref, type BillingScope } from "@/lib/billing/upgrade-href";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.billing.featureGate;

type BooleanFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends boolean ? Key : never;
}[keyof PlanFeatures];

type FeatureGateVariant = "section" | "inline";

type PlanWithFeatures = {
  name: string;
  tier: string;
  scope: string;
  sortOrder: number;
  features: PlanFeatures;
};

type PlansResponse = {
  ok: true;
  data: {
    plans: Record<string, PlanWithFeatures[]>;
  };
};

async function fetchPlans(url: string): Promise<PlansResponse> {
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

/**
 * Lowest-`sortOrder` plan (for this scope) that grants `feature` → its tier
 * name, uppercased ("PRO" / "PREMIUM"). Derived from the live plan-config
 * (`/api/billing/plans`) so the displayed required-tier can never drift from
 * the actual grants — this is the fix for PLAN-GATE-HINT-DIVERGENCE (the old
 * gate hardcoded "PRO" even for PREMIUM-only features and for the studio
 * `analytics_booking_insights` which needs PREMIUM, not PRO).
 */
function requiredTierLabel(
  plansData: PlansResponse | undefined,
  feature: BooleanFeatureKey,
  scope: string
): string | null {
  const plans = plansData?.data?.plans?.[scope];
  if (!plans) return null;
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const plan of sorted) {
    if (plan.features && Boolean(plan.features[feature])) return plan.name.toUpperCase();
  }
  return null;
}

type FeatureGateProps = {
  feature: BooleanFeatureKey;
  scope: BillingScope;
  /**
   * Lock-decision override (e.g. server-computed gating that already resolved
   * the plan). When omitted, the lock is self-derived via
   * `usePlanFeatures(scope).can(feature)`.
   */
  available?: boolean;
  /**
   * `"section"` (default) blurs the children behind a centred lock card — for
   * a whole gated section (analytics charts). `"inline"` replaces the content
   * with a compact lock row — for a single control (a toggle, a notification
   * channel).
   */
  variant?: FeatureGateVariant;
  /** Surface-specific reason shown under the tier badge. */
  description?: string;
  className?: string;
  children: ReactNode;
};

/**
 * The single, shared plan-gate locked-state component (FIX-27). Replaces the 6
 * divergent presentations with one visual language: a Lock icon, a
 * "Доступно на тарифе {TIER}" badge (tier derived from plan-config, never
 * hardcoded), a surface-specific reason, and an upgrade CTA routing to the
 * scope-correct billing page (`billingUpgradeHref`, FIX-26).
 *
 * Enforcement is untouched — this only changes how the lock *looks*. The
 * server gates still 403/409 for FREE; an entitled subject renders `children`
 * normally (the gate disappears).
 */
export function FeatureGate({
  feature,
  scope,
  available,
  variant = "section",
  description,
  className,
  children,
}: FeatureGateProps) {
  const plan = usePlanFeatures(scope);
  const selfDerived = available === undefined;
  const locked = selfDerived ? !plan.can(feature) : !available;

  const { data: plansData } = useSWR<PlansResponse>(
    locked ? "/api/billing/plans" : null,
    fetchPlans,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  // Only the self-derived path has a meaningful loading state; with an explicit
  // `available` the server already decided, so render immediately.
  if (selfDerived && plan.loading) {
    return variant === "inline" ? null : (
      <div className="rounded-2xl bg-bg-card/80 p-4 text-xs text-text-sec">{T.loading}</div>
    );
  }

  if (!locked) return <>{children}</>;

  const tier = requiredTierLabel(plansData, feature, scope) ?? "PRO";
  const href = billingUpgradeHref(scope);
  const badge = T.tierBadge.replace("{plan}", tier);
  const cta = T.upgradeCta.replace("{plan}", tier);

  if (variant === "inline") {
    return (
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-bg-card p-4 ${className ?? ""}`}
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 text-accent-text">
          <Lock className="h-4 w-4" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{badge}</span>
        </span>
        {description ? (
          <p className="min-w-0 flex-1 text-sm text-text-sec">{description}</p>
        ) : (
          <span className="flex-1" />
        )}
        <Button asChild variant="primary" size="sm" className="shrink-0">
          <Link href={href}>{cta}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* `inert` обязателен рядом с aria-hidden: aria-hidden прячет поддерево
          от AT, но фокусируемые потомки остаются в tab-порядке — клавиатурный
          пользователь попадал бы в невидимые для него контролы. */}
      <div inert aria-hidden className="pointer-events-none select-none opacity-30 blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-primary/30 bg-bg-card p-6 text-center shadow-card">
          <div className="mb-2 inline-flex items-center gap-1.5 text-accent-text">
            <Lock className="h-4 w-4" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{badge}</span>
          </div>
          {description ? <p className="mb-4 text-sm text-text-main">{description}</p> : null}
          <Button asChild variant="primary" size="sm">
            <Link href={href}>{cta}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

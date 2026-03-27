"use client";

import type { ReactNode } from "react";
import useSWR from "swr";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import type { PlanFeatures } from "@/lib/billing/types";
import { UI_TEXT } from "@/lib/ui/text";

type BooleanFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends boolean ? Key : never;
}[keyof PlanFeatures];

type FeatureGateProps = {
  feature: BooleanFeatureKey;
  /** @deprecated Computed automatically from plans API. Kept for backward compatibility. */
  requiredPlan?: string;
  scope?: "MASTER" | "STUDIO";
  title?: string;
  description?: string;
  ctaLabel?: string;
  fallback?: ReactNode;
  className?: string;
  children: ReactNode;
};

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

function findMinPlanName(
  plansData: PlansResponse | undefined,
  feature: BooleanFeatureKey,
  scope: string
): string | null {
  if (!plansData?.data?.plans) return null;
  const plans = plansData.data.plans[scope];
  if (!plans) return null;
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const plan of sorted) {
    if (plan.features && Boolean(plan.features[feature])) {
      return plan.name;
    }
  }
  return null;
}

export function FeatureGate({
  feature,
  requiredPlan: requiredPlanOverride,
  scope,
  title,
  description,
  ctaLabel = UI_TEXT.billing.featureGate.ctaLabel,
  fallback,
  className,
  children,
}: FeatureGateProps) {
  const plan = usePlanFeatures(scope);
  const resolvedScope = scope === "STUDIO" ? "STUDIO" : "MASTER";

  const { data: plansData } = useSWR<PlansResponse>(
    plan.can(feature) ? null : "/api/billing/plans",
    fetchPlans,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  if (plan.loading) {
    return (
      <div className="rounded-2xl bg-bg-card/80 p-4 text-xs text-text-sec">
        {UI_TEXT.billing.featureGate.loading}
      </div>
    );
  }

  if (plan.can(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const requiredLabel = findMinPlanName(plansData, feature, resolvedScope) ?? requiredPlanOverride ?? "PRO";
  const billingHref = `/cabinet/billing?scope=${resolvedScope}`;
  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="pointer-events-none opacity-40">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-bg-card/80 p-4 text-center backdrop-blur-sm">
        <div className="max-w-sm">
          <div className="text-sm font-semibold text-text-main">
            {title ?? UI_TEXT.billing.featureGate.title}
          </div>
          <div className="mt-1 text-xs text-text-sec">
            {description ??
              UI_TEXT.billing.featureGate.description.replace("{plan}", String(requiredLabel))}
          </div>
          <a
            href={billingHref}
            className="mt-3 inline-flex rounded-lg border border-border-subtle bg-bg-input px-3 py-1.5 text-xs text-text-main transition hover:bg-bg-card"
          >
            {ctaLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

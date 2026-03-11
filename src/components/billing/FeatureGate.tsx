"use client";

import type { ReactNode } from "react";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import type { PlanFeatures, PlanTier } from "@/lib/billing/types";
import { UI_TEXT } from "@/lib/ui/text";

type BooleanFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends boolean ? Key : never;
}[keyof PlanFeatures];

type FeatureGateProps = {
  feature: BooleanFeatureKey;
  requiredPlan?: PlanTier;
  scope?: "MASTER" | "STUDIO";
  title?: string;
  description?: string;
  ctaLabel?: string;
  fallback?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function FeatureGate({
  feature,
  requiredPlan,
  scope,
  title,
  description,
  ctaLabel = UI_TEXT.billing.featureGate.ctaLabel,
  fallback,
  className,
  children,
}: FeatureGateProps) {
  const plan = usePlanFeatures(scope);

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

  const requiredLabel = requiredPlan ?? "PRO";
  const billingHref = `/cabinet/billing?scope=${scope === "STUDIO" ? "STUDIO" : "MASTER"}`;
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

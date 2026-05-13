"use client";

import { Check, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRublesFromKopeks } from "@/features/admin-cabinet/billing/lib/kopeks";
import {
  tierAndScopeLabel,
  tierLabel,
} from "@/features/admin-cabinet/billing/lib/plan-display";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminPlanCard } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.plans;
const COUNT_FMT = new Intl.NumberFormat("ru-RU");

type Props = {
  plan: AdminPlanCard;
  onEdit: () => void;
};

/** Single plan card. PREMIUM tier gets a brand-tinted background +
 * POPULAR ribbon top-right. FREE tier hides the price suffix
 * (no «₽ / мес» when the price is zero). */
export function PlanCardView({ plan, onEdit }: Props) {
  const isFree = plan.primaryPricePerMonthKopeks === 0;
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-2xl border p-5 shadow-card",
        plan.isFeatured
          ? "border-primary/40 bg-gradient-to-br from-primary/8 via-bg-card to-bg-card"
          : "border-border-subtle bg-bg-card",
        !plan.isActive && "opacity-60",
      )}
    >
      {plan.isFeatured ? (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-brand-gradient px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
          <Sparkles className="h-2.5 w-2.5" aria-hidden />
          {T.featuredBadge}
        </span>
      ) : null}

      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
          {tierAndScopeLabel(plan.tier, plan.scope)}
        </p>
        <h3 className="mt-1 font-display text-lg text-text-main">{plan.name}</h3>
      </header>

      <div className="mt-4 mb-4 flex items-baseline gap-1.5">
        {isFree ? (
          <span className="font-display text-2xl font-semibold tracking-tight text-text-main">
            {T.priceFree}
          </span>
        ) : (
          <>
            <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-text-main">
              {formatRublesFromKopeks(plan.primaryPricePerMonthKopeks)}
            </span>
            <span className="text-xs text-text-sec">{T.pricePerMonth}</span>
          </>
        )}
      </div>

      <p className="mb-4 text-xs text-text-sec">
        <span className="tabular-nums text-text-main">
          {COUNT_FMT.format(plan.activeSubscriptionsCount)}
        </span>{" "}
        {T.activeCountSuffix}
        {!plan.isActive ? (
          <>
            <span className="mx-1.5 text-text-sec/40" aria-hidden>
              ·
            </span>
            <span className="text-amber-600 dark:text-amber-400">
              {T.inactiveBadge}
            </span>
          </>
        ) : null}
      </p>

      {plan.features.length > 0 ? (
        <ul className="mb-5 flex flex-1 flex-col gap-2">
          {plan.features.map((feature, index) => (
            <li key={`${feature.title}-${index}`} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              >
                <Check className="h-2.5 w-2.5" />
              </span>
              <span className="text-sm text-text-main">
                {feature.title}
                {feature.detail ? (
                  <span className="ml-1.5 font-mono text-xs text-text-sec">
                    {feature.detail}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-5 flex-1" />
      )}

      <Button variant="secondary" size="md" onClick={onEdit} className="w-full">
        <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {T.editButton}
      </Button>

      <span className="sr-only">{tierLabel(plan.tier)}</span>
    </article>
  );
}

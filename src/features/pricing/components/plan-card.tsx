import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";
import {
  calcSavingsPercent,
  type MarketingPlan,
} from "@/lib/billing/marketing-pricing";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.pricing;

const PERIODS = [1, 3, 6, 12] as const;

type Props = {
  plan: MarketingPlan | null;
  /** Plan code used for name/description lookup if `plan` is null. */
  fallbackCode: string;
  highlighted?: boolean;
};

function periodLabel(months: number): string {
  if (months === 1) return T.periods["1"];
  if (months === 3) return T.periods["3"];
  if (months === 6) return T.periods["6"];
  if (months === 12) return T.periods["12"];
  return `${months} мес.`;
}

function planNameFor(code: string): string {
  const map = T.planNames as Record<string, string | undefined>;
  return map[code] ?? code;
}

function planDescriptionFor(code: string): string {
  const map = T.planDescriptions as Record<string, string | undefined>;
  return map[code] ?? "";
}

function listIncludedFeatures(plan: MarketingPlan): Array<{ key: FeatureKey; title: string }> {
  const out: Array<{ key: FeatureKey; title: string; uiOrder: number }> = [];
  for (const [key, def] of Object.entries(FEATURE_CATALOG)) {
    if (def.appliesTo !== "BOTH" && def.appliesTo !== plan.scope) continue;
    if (def.kind === "limit") continue;
    const value = plan.features[key as FeatureKey];
    if (value !== true) continue;
    out.push({ key: key as FeatureKey, title: def.title, uiOrder: def.uiOrder });
  }
  out.sort((a, b) => a.uiOrder - b.uiOrder);
  return out.map(({ key, title }) => ({ key, title }));
}

function limitLine(plan: MarketingPlan): string | null {
  if (plan.scope === "STUDIO") {
    const max = plan.features.maxTeamMasters;
    if (typeof max === "number" && max > 0) {
      return T.plan.forStudio.replace("{count}", String(max));
    }
  } else {
    const max = plan.features.maxPortfolioPhotosSolo;
    if (typeof max === "number" && max > 0) {
      return T.plan.forSolo.replace("{count}", String(max));
    }
  }
  return null;
}

export function PlanCard({ plan, fallbackCode, highlighted = false }: Props) {
  const name = planNameFor(plan?.code ?? fallbackCode);
  const description = planDescriptionFor(plan?.code ?? fallbackCode);
  const tier = plan?.tier ?? fallbackCode.split("_")[1];

  const monthly = plan ? plan.prices.find((p) => p.periodMonths === 1) : null;

  const cardClass = highlighted
    ? "rounded-2xl bg-brand-gradient p-7 text-white shadow-card"
    : "rounded-2xl border border-border-subtle bg-bg-card/50 p-7";

  const labelClass = highlighted ? "text-white/85" : "text-primary";
  const headingClass = highlighted ? "text-white" : "text-text-main";
  const subTextClass = highlighted ? "text-white/80" : "text-text-sec";
  const checkClass = highlighted ? "text-white" : "text-primary";
  const featureTextClass = highlighted ? "text-white/95" : "text-text-main";

  return (
    <article className={cardClass}>
      {/* Tier label + plan name + short description */}
      <p className={`mb-2 font-mono text-xs font-medium uppercase tracking-[0.18em] ${labelClass}`}>
        {tier}
      </p>
      <h3 className={`mb-1 font-display text-2xl ${headingClass}`}>{name}</h3>
      {description ? (
        <p className={`mb-5 text-sm leading-relaxed ${subTextClass}`}>{description}</p>
      ) : (
        <div className="mb-5" />
      )}

      {/* Pricing — 4 rows for paid plans, single line for FREE, placeholder if no data */}
      {!plan ? (
        <div className="mb-6">
          <p className={`font-display text-2xl ${headingClass}`}>{T.periods.placeholder}</p>
          <p className={`mt-1 text-xs ${subTextClass}`}>{T.periods.placeholderHint}</p>
        </div>
      ) : plan.isFreePlan ? (
        <div className="mb-6">
          <span className={`font-display text-4xl ${headingClass}`}>0 ₽</span>
          <span className={`ml-2 text-sm ${subTextClass}`}>{T.periods.free}</span>
        </div>
      ) : plan.prices.length === 0 ? (
        <div className="mb-6">
          <p className={`font-display text-2xl ${headingClass}`}>{T.periods.placeholder}</p>
          <p className={`mt-1 text-xs ${subTextClass}`}>{T.periods.placeholderHint}</p>
        </div>
      ) : (
        <dl className="mb-6 space-y-1.5 text-sm">
          {PERIODS.map((months) => {
            const entry = plan.prices.find((p) => p.periodMonths === months);
            if (!entry) return null;
            const savings = calcSavingsPercent(monthly?.priceKopeks, entry.priceKopeks, months);
            return (
              <div key={months} className="flex items-baseline justify-between gap-3">
                <dt className={subTextClass}>{periodLabel(months)}</dt>
                <dd className="text-right">
                  <span className={`font-display text-base tabular-nums ${headingClass}`}>
                    {UI_FMT.priceLabel(entry.priceKopeks)}
                  </span>
                  {savings !== null ? (
                    <span className={`ml-2 text-xs ${subTextClass}`}>
                      {T.periods.savingsBadge.replace("{pct}", String(savings))}
                    </span>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* Features (only when we have plan data; otherwise card is a stub) */}
      {plan ? (
        <ul className="mb-7 space-y-2.5">
          {(() => {
            const limit = limitLine(plan);
            return limit ? (
              <li className="flex items-start gap-2 text-sm">
                <Check className={`mt-0.5 h-4 w-4 shrink-0 ${checkClass}`} aria-hidden />
                <span className={featureTextClass}>{limit}</span>
              </li>
            ) : null;
          })()}
          {listIncludedFeatures(plan).map(({ key, title }) => (
            <li key={key} className="flex items-start gap-2 text-sm">
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${checkClass}`} aria-hidden />
              <span className={featureTextClass}>{title}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* CTA — primary on neutral cards, white-on-bordeaux on highlighted */}
      {plan ? (
        <Button
          asChild
          variant={highlighted ? "secondary" : "primary"}
          className={
            highlighted
              ? "w-full border-white/0 bg-white text-primary hover:bg-white/90"
              : "w-full"
          }
        >
          <Link href="/login">{plan.isFreePlan ? T.plan.ctaFree : T.plan.ctaPaid}</Link>
        </Button>
      ) : (
        <Button variant="ghost" disabled className="w-full">
          {T.plan.ctaUnavailable}
        </Button>
      )}
    </article>
  );
}

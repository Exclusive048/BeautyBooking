"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";
import { BILLING_YEARLY_DISCOUNT } from "@/lib/billing/constants";
import { cn } from "@/lib/cn";
import { dateRU, moneyRUBFromKopeks } from "@/lib/format";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type SubscriptionScope = "MASTER" | "STUDIO";
type PeriodMonths = 1 | 3 | 6 | 12;

type PlanPrice = {
  periodMonths: PeriodMonths;
  priceKopeks: number;
};

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  tier: string;
  scope: SubscriptionScope;
  prices: PlanPrice[];
  features: Record<string, boolean | number | null>;
};

type PlansResponse = {
  plans: Record<SubscriptionScope, BillingPlan[]>;
};

type SubscriptionSummary = {
  id: string;
  scope: SubscriptionScope;
  status: string;
  periodMonths: number;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  graceUntil: string | null;
  plan: {
    id: string;
    code: string;
    name: string;
    tier: string;
    scope: SubscriptionScope;
  };
  pendingConfirmationUrl: string | null;
};

type StatusResponse = {
  subscriptions: Record<SubscriptionScope, SubscriptionSummary | null>;
  availableScopes: SubscriptionScope[];
};

type BillingPageProps = {
  scope: SubscriptionScope;
};

function getPrice(plan: BillingPlan, periodMonths: PeriodMonths): PlanPrice | null {
  return plan.prices.find((price) => price.periodMonths === periodMonths) ?? null;
}

function getBaseMonthlyPriceKopeks(plan: BillingPlan): number | null {
  return getPrice(plan, 1)?.priceKopeks ?? null;
}

function getDisplayMonthlyPriceKopeks(plan: BillingPlan, periodMonths: PeriodMonths): number | null {
  const price = getPrice(plan, periodMonths);
  if (price) return Math.floor(price.priceKopeks / periodMonths);
  // Fallback: monthly price with yearly discount for 12 months
  const monthly = getBaseMonthlyPriceKopeks(plan);
  if (monthly === null) return null;
  if (periodMonths === 12) return Math.floor(monthly * (1 - BILLING_YEARLY_DISCOUNT));
  return monthly;
}

function getCheckoutAmountKopeks(plan: BillingPlan, periodMonths: PeriodMonths): number | null {
  const price = getPrice(plan, periodMonths);
  if (price) return price.priceKopeks;
  const monthly = getBaseMonthlyPriceKopeks(plan);
  if (monthly === null) return null;
  if (periodMonths === 12) return Math.floor(monthly * 12 * (1 - BILLING_YEARLY_DISCOUNT));
  return monthly * periodMonths;
}

function getSavingsPct(plan: BillingPlan, periodMonths: PeriodMonths): number {
  if (periodMonths === 1) return 0;
  const monthly = getBaseMonthlyPriceKopeks(plan);
  if (monthly === null || monthly === 0) return 0;
  const total = getCheckoutAmountKopeks(plan, periodMonths);
  if (total === null) return 0;
  return Math.max(0, Math.round((1 - total / (monthly * periodMonths)) * 100));
}

function formatPeriodLabel(periodMonths: PeriodMonths) {
  if (periodMonths === 1) return UI_TEXT.billing.period.month;
  if (periodMonths === 3) return UI_TEXT.billing.period.months3;
  if (periodMonths === 6) return UI_TEXT.billing.period.months6;
  return UI_TEXT.billing.period.year;
}

function buildDefaultPeriods() {
  return { MASTER: 1, STUDIO: 1 } as Record<SubscriptionScope, PeriodMonths>;
}

function getAvailablePeriods(plans: BillingPlan[]): PeriodMonths[] {
  const periodsSet = new Set<PeriodMonths>();
  for (const plan of plans) {
    for (const p of plan.prices) {
      if (p.periodMonths === 1 || p.periodMonths === 3 || p.periodMonths === 6 || p.periodMonths === 12) {
        periodsSet.add(p.periodMonths as PeriodMonths);
      }
    }
  }
  const sorted = Array.from(periodsSet).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : [1, 12];
}

// ── Active Features Panel ─────────────────────────────────────────────────────

type FeatureGroup = {
  group: string;
  items: Array<{
    key: FeatureKey;
    title: string;
    description: string;
    enabled: boolean;
    limitValue: number | null | undefined;
  }>;
};

function buildFeatureGroups(
  features: Record<string, boolean | number | null>,
  scope: SubscriptionScope
): FeatureGroup[] {
  const groupMap = new Map<string, FeatureGroup>();

  const sortedKeys = (Object.keys(FEATURE_CATALOG) as FeatureKey[]).sort(
    (a, b) => FEATURE_CATALOG[a].uiOrder - FEATURE_CATALOG[b].uiOrder
  );

  for (const key of sortedKeys) {
    const def = FEATURE_CATALOG[key];
    if (def.appliesTo !== "BOTH" && def.appliesTo !== scope) continue;

    const raw = features[key];
    let enabled: boolean;
    let limitValue: number | null | undefined;

    if (def.kind === "limit") {
      limitValue = raw as number | null | undefined;
      enabled = raw !== 0 && raw !== undefined;
    } else {
      enabled = Boolean(raw);
      limitValue = undefined;
    }

    if (!groupMap.has(def.group)) {
      groupMap.set(def.group, { group: def.group, items: [] });
    }
    groupMap.get(def.group)!.items.push({ key, title: def.title, description: def.description, enabled, limitValue });
  }

  return Array.from(groupMap.values());
}

function ActiveFeaturesPanel({
  plan,
  scope,
}: {
  plan: BillingPlan;
  scope: SubscriptionScope;
}) {
  const groups = useMemo(() => buildFeatureGroups(plan.features, scope), [plan.features, scope]);
  const enabledGroups = groups.filter((g) => g.items.some((i) => i.enabled));
  const lockedItems = groups.flatMap((g) => g.items.filter((i) => !i.enabled));

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-text-main">
        {UI_TEXT.billing.currentFeatures.sectionTitle(plan.name)}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {enabledGroups.map((group) => (
          <div key={group.group} className="lux-card rounded-2xl p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-sec">
              {group.group}
            </div>
            <ul className="space-y-2">
              {group.items
                .filter((item) => item.enabled)
                .map((item) => (
                  <li key={item.key} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                      <Check className="h-2.5 w-2.5 text-emerald-500" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-text-main leading-snug">
                        {item.title}
                        {item.limitValue === null ? (
                          <span className="ml-1.5 text-[10px] text-emerald-500 font-normal">
                            ({UI_TEXT.billing.currentFeatures.unlimitedValue})
                          </span>
                        ) : item.limitValue !== undefined ? (
                          <span className="ml-1.5 text-[10px] text-text-sec font-normal">
                            ({UI_TEXT.billing.currentFeatures.limitValue(item.limitValue)})
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-text-sec leading-snug">{item.description}</div>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {lockedItems.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none list-none text-xs text-text-sec hover:text-text-main">
            <span className="underline decoration-dashed underline-offset-2">
              {UI_TEXT.billing.currentFeatures.upgradeHint} ({lockedItems.length})
            </span>
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lockedItems.map((item) => (
              <div key={item.key} className="flex items-start gap-2 rounded-xl border border-border-subtle/60 bg-bg-elevated/60 px-3 py-2 opacity-60">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-bg-input">
                  <X className="h-2.5 w-2.5 text-text-sec" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-text-main leading-snug">{item.title}</div>
                  <div className="text-[11px] text-text-sec leading-snug">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function BillingPage({ scope }: BillingPageProps) {
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyScope, setBusyScope] = useState<SubscriptionScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Record<SubscriptionScope, PeriodMonths>>(
    buildDefaultPeriods()
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, statusRes] = await Promise.all([
        fetch("/api/billing/plans", { cache: "no-store" }),
        fetch("/api/billing/status", { cache: "no-store" }),
      ]);

      const plansJson = (await plansRes.json().catch(() => null)) as ApiResponse<PlansResponse> | null;
      const statusJson = (await statusRes.json().catch(() => null)) as ApiResponse<StatusResponse> | null;

      if (!plansRes.ok || !plansJson || !plansJson.ok) {
        throw new Error(plansJson && !plansJson.ok ? plansJson.error.message : "Не удалось загрузить тарифы.");
      }
      if (!statusRes.ok || !statusJson || !statusJson.ok) {
        throw new Error(statusJson && !statusJson.ok ? statusJson.error.message : "Не удалось загрузить подписки.");
      }

      setPlans(plansJson.data);
      setStatus(statusJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCheckout = async (selectedScope: SubscriptionScope, plan: BillingPlan) => {
    const periodMonths = selectedPeriod[selectedScope];
    const totalAmountKopeks = getCheckoutAmountKopeks(plan, periodMonths);
    if (totalAmountKopeks === null) {
      setError("Не удалось определить стоимость тарифа.");
      return;
    }

    setBusyScope(selectedScope);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: selectedScope,
          planId: plan.id,
          periodMonths,
          totalAmountKopeks,
          returnUrl: `${window.location.origin}${selectedScope === "STUDIO" ? "/cabinet/studio/billing" : "/cabinet/master/billing"}`,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { confirmationUrl?: string; mode?: string } }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json || !("ok" in json) || !json.ok) {
        throw new Error(json && "error" in json ? json.error.message : "Не удалось создать оплату.");
      }
      if (json.data.confirmationUrl) {
        window.location.href = json.data.confirmationUrl;
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать оплату.");
    } finally {
      setBusyScope(null);
    }
  };

  const handleToggleAutoRenew = async (selectedScope: SubscriptionScope, nextValue: boolean) => {
    setBusyScope(selectedScope);
    setError(null);
    try {
      const res = await fetch("/api/billing/auto-renew", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: selectedScope, autoRenew: nextValue }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ autoRenew: boolean }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(
          json && !json.ok
            ? json.error.message
            : nextValue
              ? UI_TEXT.billing.autoRenew.enableFailed
              : UI_TEXT.billing.autoRenew.disableFailed
        );
      }
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : nextValue
            ? UI_TEXT.billing.autoRenew.enableFailed
            : UI_TEXT.billing.autoRenew.disableFailed
      );
    } finally {
      setBusyScope(null);
    }
  };

  const scopePlans = useMemo(() => {
    if (!plans) return null;
    return plans.plans[scope] ?? [];
  }, [plans, scope]);

  const activePlan = useMemo(() => {
    if (!scopePlans) return null;
    const sub = status?.subscriptions[scope];
    if (sub) {
      return scopePlans.find((p) => p.id === sub.plan.id) ?? scopePlans[0] ?? null;
    }
    return scopePlans[0] ?? null;
  }, [scopePlans, status, scope]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка...</div>;
  }

  if (!scopePlans) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Тарифы недоступны.</div>;
  }

  const subscription = status?.subscriptions[scope] ?? null;
  const isBusy = busyScope === scope;
  const autoRenewEnabled = Boolean(subscription?.autoRenew && !subscription?.cancelAtPeriodEnd);
  const isFreePlan = !subscription || subscription.plan.tier === "FREE";
  const isActiveSub = subscription?.status === "ACTIVE" || subscription?.status === "PAST_DUE";
  const availablePeriods = getAvailablePeriods(scopePlans);

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Подписка</h1>
        <p className="mt-1 text-sm text-text-sec">Тарифы для выбранного кабинета.</p>
      </header>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-main">
              {scope === "MASTER" ? "Подписка мастера" : "Подписка студии"}
            </h2>
            {subscription ? (
              <div className="mt-1 text-xs text-text-sec">
                Текущий тариф: <span className="text-text-main">{subscription.plan.name}</span>
                {subscription.currentPeriodEnd ? (
                  <>
                    {" "}
                    • до {dateRU(new Date(subscription.currentPeriodEnd))}
                  </>
                ) : null}
                {subscription.pendingConfirmationUrl ? (
                  <>
                    {" "}
                    •{" "}
                    <a
                      className="underline"
                      href={subscription.pendingConfirmationUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Подтвердить оплату
                    </a>
                  </>
                ) : null}
                {subscription.status === "PAST_DUE" && subscription.graceUntil ? (
                  <>
                    {" "}
                    • оплатить до {dateRU(new Date(subscription.graceUntil))}
                  </>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 text-xs text-text-sec">Подписка не активна.</div>
            )}
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-xs text-text-sec">
            <div>
              <div className="text-[11px]">{UI_TEXT.billing.autoRenew.label}</div>
              <div className="text-[11px]">
                {isFreePlan
                  ? UI_TEXT.billing.autoRenew.notAvailableForFree
                  : autoRenewEnabled
                    ? UI_TEXT.billing.autoRenew.enabled
                    : UI_TEXT.billing.autoRenew.disabled}
              </div>
            </div>
            <Switch
              checked={autoRenewEnabled}
              disabled={isFreePlan || !isActiveSub || isBusy}
              onCheckedChange={(value) => void handleToggleAutoRenew(scope, value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availablePeriods.map((periodMonths) => {
            const isSelected = selectedPeriod[scope] === periodMonths;
            const refPlan = activePlan ?? scopePlans[0];
            const savings = refPlan ? getSavingsPct(refPlan, periodMonths) : 0;
            return (
              <Button
                key={periodMonths}
                variant={isSelected ? "primary" : "secondary"}
                size="none"
                onClick={() =>
                  setSelectedPeriod((current) => ({ ...current, [scope]: periodMonths }))
                }
                className="rounded-xl px-4 py-2 text-sm font-semibold"
              >
                <span className="flex items-center gap-1.5">
                  <span>{formatPeriodLabel(periodMonths)}</span>
                  {savings > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                        isSelected ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {UI_TEXT.billing.period.savingsBadge(savings)}
                    </span>
                  ) : null}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {scopePlans.map((plan) => {
            const curPeriod = selectedPeriod[scope];
            const displayMonthlyPriceKopeks = getDisplayMonthlyPriceKopeks(plan, curPeriod);
            const checkoutAmountKopeks = getCheckoutAmountKopeks(plan, curPeriod);
            const baseMonthlyPriceKopeks = getBaseMonthlyPriceKopeks(plan);
            const savingsPct = getSavingsPct(plan, curPeriod);
            const isCurrent =
              subscription?.plan.id === plan.id &&
              (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE");

            let displayPriceLabel = "Нет цены";
            if (displayMonthlyPriceKopeks !== null) {
              displayPriceLabel =
                displayMonthlyPriceKopeks > 0
                  ? moneyRUBFromKopeks(displayMonthlyPriceKopeks)
                  : "Бесплатно";
            }

            return (
              <Card key={plan.id} className={cn("flex h-full flex-col", isCurrent ? "ring-1 ring-text-main" : "")}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-text-main">{plan.name}</div>
                      <div className="mt-1 text-xs text-text-sec">{plan.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="text-2xl font-bold text-text-main">{displayPriceLabel}</span>
                        {displayMonthlyPriceKopeks !== null && displayMonthlyPriceKopeks > 0 ? (
                          <span className="text-sm text-text-sec">{UI_TEXT.billing.period.perMonth}</span>
                        ) : null}
                      </div>
                      {savingsPct > 0 && baseMonthlyPriceKopeks !== null ? (
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <span className="text-sm text-text-sec line-through">
                            {moneyRUBFromKopeks(baseMonthlyPriceKopeks)}
                          </span>
                          <span className="text-xs font-semibold text-emerald-500">
                            {UI_TEXT.billing.period.savingsBadge(savingsPct)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <div className="text-xs text-text-sec">Период: {formatPeriodLabel(curPeriod)}</div>
                  <Button
                    disabled={isBusy || isCurrent || checkoutAmountKopeks === null}
                    onClick={() => void handleCheckout(scope, plan)}
                  >
                    {isCurrent ? "Текущий тариф" : "Оформить"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {activePlan ? (
        <ActiveFeaturesPanel plan={activePlan} scope={scope} />
      ) : null}
    </section>
  );
}

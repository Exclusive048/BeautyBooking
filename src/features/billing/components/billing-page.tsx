"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
  features: Record<string, unknown>;
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

const PERIODS: PeriodMonths[] = [1, 12];

function getPrice(plan: BillingPlan, periodMonths: PeriodMonths): PlanPrice | null {
  return plan.prices.find((price) => price.periodMonths === periodMonths) ?? null;
}

function getBaseMonthlyPriceKopeks(plan: BillingPlan): number | null {
  return getPrice(plan, 1)?.priceKopeks ?? null;
}

function getDisplayMonthlyPriceKopeks(plan: BillingPlan, periodMonths: PeriodMonths): number | null {
  const monthly = getBaseMonthlyPriceKopeks(plan);
  if (monthly === null) return null;
  if (periodMonths === 12) {
    return Math.floor(monthly * (1 - BILLING_YEARLY_DISCOUNT));
  }
  return monthly;
}

function getCheckoutAmountKopeks(plan: BillingPlan, periodMonths: PeriodMonths): number | null {
  const monthly = getBaseMonthlyPriceKopeks(plan);
  if (monthly === null) {
    return getPrice(plan, periodMonths)?.priceKopeks ?? null;
  }
  if (periodMonths === 12) {
    return Math.floor(monthly * 12 * (1 - BILLING_YEARLY_DISCOUNT));
  }
  if (periodMonths === 1) return monthly;
  return getPrice(plan, periodMonths)?.priceKopeks ?? monthly * periodMonths;
}

function getYearlySavingsKopeks(plan: BillingPlan): number {
  const monthly = getBaseMonthlyPriceKopeks(plan);
  if (monthly === null) return 0;
  const fullYear = monthly * 12;
  const discountedYear = Math.floor(fullYear * (1 - BILLING_YEARLY_DISCOUNT));
  return Math.max(0, fullYear - discountedYear);
}

function formatPeriodLabel(periodMonths: PeriodMonths) {
  if (periodMonths === 1) return UI_TEXT.billing.period.month;
  if (periodMonths === 12) return UI_TEXT.billing.period.year;
  return `${periodMonths} мес.`;
}

function buildDefaultPeriods() {
  return { MASTER: 1, STUDIO: 1 } as Record<SubscriptionScope, PeriodMonths>;
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

  const handleCancel = async (selectedScope: SubscriptionScope) => {
    setBusyScope(selectedScope);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: selectedScope }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ ok: true }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось отменить автопродление.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отменить автопродление.");
    } finally {
      setBusyScope(null);
    }
  };

  const scopePlans = useMemo(() => {
    if (!plans) return null;
    return plans.plans[scope] ?? [];
  }, [plans, scope]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка...</div>;
  }

  if (!scopePlans) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Тарифы недоступны.</div>;
  }

  const subscription = status?.subscriptions[scope] ?? null;
  const isBusy = busyScope === scope;
  const autoRenewEnabled = Boolean(subscription?.autoRenew && !subscription?.cancelAtPeriodEnd);

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
              <div className="text-[11px]">Автопродление</div>
              <div className="text-[11px]">{autoRenewEnabled ? "Включено" : "Отключено"}</div>
            </div>
            <Switch
              checked={autoRenewEnabled}
              disabled={!autoRenewEnabled || isBusy}
              onCheckedChange={(value) => {
                if (!value) {
                  void handleCancel(scope);
                }
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-text-sec">
          {PERIODS.map((periodMonths) => (
            <Button
              key={periodMonths}
              variant={selectedPeriod[scope] === periodMonths ? "primary" : "secondary"}
              size="none"
              onClick={() =>
                setSelectedPeriod((current) => ({
                  ...current,
                  [scope]: periodMonths,
                }))
              }
              className="rounded-xl px-4 py-2 text-sm font-semibold"
            >
              {periodMonths === 12 ? (
                <span className="flex items-center gap-1.5">
                  <span>{formatPeriodLabel(periodMonths)}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      selectedPeriod[scope] === periodMonths
                        ? "bg-white/20 text-white"
                        : "bg-primary/20 text-primary"
                    )}
                  >
                    {UI_TEXT.billing.period.yearDiscount}
                  </span>
                </span>
              ) : (
                <span>{formatPeriodLabel(periodMonths)}</span>
              )}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {scopePlans.map((plan) => {
            const displayMonthlyPriceKopeks = getDisplayMonthlyPriceKopeks(plan, selectedPeriod[scope]);
            const checkoutAmountKopeks = getCheckoutAmountKopeks(plan, selectedPeriod[scope]);
            const baseMonthlyPriceKopeks = getBaseMonthlyPriceKopeks(plan);
            const yearlySavingsKopeks = selectedPeriod[scope] === 12 ? getYearlySavingsKopeks(plan) : 0;
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
                        <span className="text-sm text-text-sec">/мес</span>
                      </div>
                      {selectedPeriod[scope] === 12 && baseMonthlyPriceKopeks !== null ? (
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <span className="text-sm text-text-sec line-through">
                            {moneyRUBFromKopeks(baseMonthlyPriceKopeks)}
                          </span>
                          <span className="text-xs text-emerald-500">
                            {UI_TEXT.billing.period.yearSavings(Math.floor(yearlySavingsKopeks / 100))}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <div className="text-xs text-text-sec">Период: {formatPeriodLabel(selectedPeriod[scope])}</div>
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
    </section>
  );
}

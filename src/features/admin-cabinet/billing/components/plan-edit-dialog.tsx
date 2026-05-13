"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Switch } from "@/components/ui/switch";
import {
  formatRublesPrecise,
  parseRublesToKopeks,
} from "@/features/admin-cabinet/billing/lib/kopeks";
import { tierAndScopeLabel } from "@/features/admin-cabinet/billing/lib/plan-display";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminPlanCard } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.editDialog;

export type PlanEditValue = {
  name: string;
  isActive: boolean;
  sortOrder: number;
  /** Always exactly four entries (1/3/6/12 months). */
  prices: Array<{ periodMonths: 1 | 3 | 6 | 12; priceKopeks: number }>;
};

type Props = {
  open: boolean;
  plan: AdminPlanCard | null;
  onClose: () => void;
  onSubmit: (value: PlanEditValue) => Promise<void>;
};

const PERIODS: Array<1 | 3 | 6 | 12> = [1, 3, 6, 12];

function priceForPeriod(plan: AdminPlanCard, months: number): string {
  const found = plan.prices.find((p) => p.periodMonths === months);
  if (!found) return "0";
  return formatRublesPrecise(found.priceKopeks)
    .replace(" ₽", "")
    .replace(",", ".");
}

/**
 * Edit dialog scoped to plan chrome — name, prices, isActive,
 * sortOrder. Tier/scope/code are intentionally read-only because
 * they're invariant identifiers used by the rest of the billing
 * domain (cron, renewal, audit). Features are out of scope for
 * ADMIN-BILLING-A; see plan-card features list for the
 * read-only view.
 */
export function PlanEditDialog({ open, plan, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !plan) return;
    setName(plan.name);
    setIsActive(plan.isActive);
    setSortOrder(String(plan.sortOrder));
    const initial: Record<number, string> = {};
    for (const period of PERIODS) {
      initial[period] = priceForPeriod(plan, period);
    }
    setPrices(initial);
    setError(null);
  }, [open, plan]);

  const submit = async () => {
    if (!plan) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(T.errorNameRequired);
      return;
    }
    const parsedPrices: Array<{ periodMonths: 1 | 3 | 6 | 12; priceKopeks: number }> = [];
    for (const period of PERIODS) {
      const raw = prices[period] ?? "0";
      const kopeks = parseRublesToKopeks(raw);
      if (kopeks === null) {
        setError(T.errorPriceInvalid);
        return;
      }
      parsedPrices.push({ periodMonths: period, priceKopeks: kopeks });
    }
    const sortOrderNum = Number(sortOrder);
    const sortOrderClean =
      Number.isFinite(sortOrderNum) && sortOrderNum >= 0
        ? Math.trunc(sortOrderNum)
        : 0;

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        isActive,
        sortOrder: sortOrderClean,
        prices: parsedPrices,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      {!plan ? null : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-border-subtle bg-bg-input/40 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
              {T.sections.identity}
            </p>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <ReadonlyRow label={T.fields.codeLabel} value={plan.code} mono />
              <ReadonlyRow
                label={T.fields.tierLabel}
                value={tierAndScopeLabel(plan.tier, plan.scope)}
              />
              <ReadonlyRow label={T.fields.scopeLabel} value={plan.scope} mono />
            </dl>
            <p className="mt-2 text-xs text-text-sec">{T.readonlyNote}</p>
          </section>

          <section className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
              {T.sections.main}
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-text-sec">
                {T.fields.nameLabel}
              </span>
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError(null);
                }}
              />
            </label>

            <div className="flex items-center justify-between rounded-xl border border-border-subtle/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-text-main">
                  {T.fields.isActiveLabel}
                </p>
                <p className="mt-0.5 text-xs text-text-sec">
                  {T.fields.isActiveHint}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked)}
              />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-text-sec">
                {T.fields.sortOrderLabel}
              </span>
              <Input
                inputMode="numeric"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
              <span className="mt-1 block text-xs text-text-sec/70">
                {T.fields.sortOrderHint}
              </span>
            </label>
          </section>

          <section className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
              {T.sections.prices}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PERIODS.map((period) => (
                <label key={period} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-text-sec">
                    {T.fields.priceLabel.replace("{months}", String(period))}
                  </span>
                  <div className="relative">
                    <Input
                      inputMode="decimal"
                      value={prices[period] ?? "0"}
                      onChange={(event) =>
                        setPrices({ ...prices, [period]: event.target.value })
                      }
                      className="pr-7"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-sec">
                      {T.fields.priceCurrency}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <p className="rounded-xl border border-border-subtle/60 bg-bg-input/40 px-3 py-2 text-xs text-text-sec">
            {T.featuresNote}
          </p>

          {error ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {T.cancel}
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={submitting}>
              {T.save}
            </Button>
          </div>
        </div>
      )}
    </ModalSurface>
  );
}

function ReadonlyRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-text-sec">{label}</dt>
      <dd
        className={
          mono
            ? "mt-0.5 font-mono text-sm text-text-main"
            : "mt-0.5 text-sm text-text-main"
        }
      >
        {value}
      </dd>
    </div>
  );
}

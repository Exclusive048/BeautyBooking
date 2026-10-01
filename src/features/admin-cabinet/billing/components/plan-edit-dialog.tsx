"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Switch } from "@/components/ui/switch";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useConfirm } from "@/hooks/use-confirm";
import { moneyRUBFromKopeks } from "@/lib/format";
import { kopeksToRublesInput, parseRublesToKopeks } from "@/lib/money/kopeks";
import { tierAndScopeLabel } from "@/features/admin-cabinet/billing/lib/plan-display";
import { PlanFeaturesEditor } from "@/features/admin-cabinet/billing/components/plan-features-editor";
import type { PlanFeatureOverrides } from "@/lib/billing/features";
import { resolvePlanPrice } from "@/lib/billing/pricing";
import { findOrphanedOfferedPeriod } from "@/lib/billing/price-active-guard";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminPlanCard,
  AdminPlanInheritanceCandidate,
} from "@/features/admin-cabinet/billing/types";
import { Select } from "@/components/ui/select";

const T = UI_TEXT.adminPanel.billing.editDialog;

export type PlanEditValue = {
  name: string;
  isActive: boolean;
  sortOrder: number;
  /** Always exactly four entries (1/3/6/12 months). `isActive` — R2-05-J
   * per-period toggle: a deactivated price is kept but excluded from resolution. */
  prices: Array<{ periodMonths: 1 | 3 | 6 | 12; priceKopeks: number; isActive: boolean }>;
  /** Parent plan id (null to detach). Sent only when the value
   * actually changed from the dialog's open state. */
  inheritsFromPlanId: string | null;
  /** Catalog-respecting overrides. Always sent (even when empty) so
   * the server can wipe stale keys if the admin cleared overrides. */
  features: PlanFeatureOverrides;
};

type Props = {
  open: boolean;
  plan: AdminPlanCard | null;
  /** All other plans — used by the features editor to render the
   * inheritance select and resolve `parentEffective`. */
  candidates: AdminPlanInheritanceCandidate[];
  onClose: () => void;
  onSubmit: (value: PlanEditValue) => Promise<void>;
};

const PERIODS: Array<1 | 3 | 6 | 12> = [1, 3, 6, 12];

function priceForPeriod(plan: AdminPlanCard, months: number): string {
  const found = plan.prices.find((p) => p.periodMonths === months);
  if (!found) return "0";
  return kopeksToRublesInput(found.priceKopeks);
}

/**
 * Edit dialog with two tabs:
 *   - Main: name, isActive, sortOrder, prices, inheritance select
 *   - Features: full overrides editor (boolean toggles + limit caps,
 *     inheritance-aware) — restored in ADMIN-BILLING-FIX-B.
 *
 * Tier/scope/code stay read-only because they're invariant identifiers
 * used by the rest of the billing domain (cron, renewal, audit).
 */
export function PlanEditDialog({ open, plan, candidates, onClose, onSubmit }: Props) {
  const [activeTab, setActiveTab] = useState<"main" | "features">("main");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [prices, setPrices] = useState<Record<number, string>>({});
  // R2-05-J: per-period active toggle (parallel to `prices`, keyed by months).
  const [pricesActive, setPricesActive] = useState<Record<number, boolean>>({});
  const [inheritsFromPlanId, setInheritsFromPlanId] = useState<string | null>(null);
  const [features, setFeatures] = useState<PlanFeatureOverrides>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // R2-05-H: confirm gate before the irreversible mass-notification path
  // (disabling a plan that has active subscribers fans out a "приостановлен"
  // notification to all of them — a mis-click is unrecoverable). The reversible
  // toggle itself stays frictionless; only the save-that-disables-with-active-subs
  // is gated. Below the threshold (0 active subs) saving proceeds without friction.
  const { confirm, modal: confirmModal } = useConfirm();

  useEffect(() => {
    if (!open || !plan) return;
    setActiveTab("main");
    setName(plan.name);
    setIsActive(plan.isActive);
    setSortOrder(String(plan.sortOrder));
    const initial: Record<number, string> = {};
    const initialActive: Record<number, boolean> = {};
    for (const period of PERIODS) {
      initial[period] = priceForPeriod(plan, period);
      const row = plan.prices.find((p) => p.periodMonths === period);
      initialActive[period] = row ? row.isActive : true;
    }
    setPrices(initial);
    setPricesActive(initialActive);
    setInheritsFromPlanId(plan.inheritsFromPlanId);
    setFeatures({ ...plan.rawFeatures });
    setError(null);
  }, [open, plan]);

  const submit = async () => {
    if (!plan) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(T.errorNameRequired);
      return;
    }
    const parsedPrices: Array<{ periodMonths: 1 | 3 | 6 | 12; priceKopeks: number; isActive: boolean }> = [];
    for (const period of PERIODS) {
      const raw = prices[period] ?? "0";
      const kopeks = parseRublesToKopeks(raw);
      if (kopeks === null) {
        setError(T.errorPriceInvalid);
        return;
      }
      parsedPrices.push({
        periodMonths: period,
        priceKopeks: kopeks,
        isActive: pricesActive[period] ?? true,
      });
    }
    const sortOrderNum = Number(sortOrder);
    const sortOrderClean =
      Number.isFinite(sortOrderNum) && sortOrderNum >= 0
        ? Math.trunc(sortOrderNum)
        : 0;

    // R2-05-H: gate the disable-with-active-subscribers path. `plan.isActive`
    // is the original (open-time) value; `isActive` is the pending toggle. Only
    // an active→inactive transition fans out the "приостановлен" mass notice,
    // and only when there are active subscribers to receive it.
    const willDisableWithActiveSubs =
      plan.isActive === true &&
      isActive === false &&
      plan.activeSubscriptionsCount > 0;
    if (willDisableWithActiveSubs) {
      const confirmed = await confirm({
        title: T.disableConfirmTitle,
        message: T.disableConfirmBody.replace(
          "{count}",
          String(plan.activeSubscriptionsCount),
        ),
        confirmLabel: T.disableConfirmAction,
        variant: "danger",
      });
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        isActive,
        sortOrder: sortOrderClean,
        prices: parsedPrices,
        inheritsFromPlanId,
        features,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Candidate parent plans for the inheritance select: every plan in
  // the same scope **except** this plan itself (selecting self would
  // hit the cycle check server-side anyway, but we hide it for UX).
  const parentCandidates = plan
    ? candidates.filter((c) => c.id !== plan.id && c.scope === plan.scope)
    : [];

  // R2-05-J: live effective price per period (what `resolvePlanPrice` yields for
  // the current price+toggle state — the R2-05-C-v2 tie-in: this is the amount
  // renewal/checkout will read) + the orphan guard the server enforces, mirrored
  // client-side so an admin can't save a plan that would strand an offered period.
  const priceEntries = PERIODS.map((period) => ({
    periodMonths: period,
    priceKopeks: parseRublesToKopeks(prices[period] ?? "0") ?? 0,
    isActive: pricesActive[period] ?? true,
  }));
  const activeRows = priceEntries
    .filter((e) => e.priceKopeks > 0 && e.isActive)
    .map((e) => ({ periodMonths: e.periodMonths, priceKopeks: e.priceKopeks }));
  const orphanedPeriod = isActive ? findOrphanedOfferedPeriod(priceEntries) : null;

  const TABS: TabItem[] = [
    { id: "main", label: T.tabs.main },
    { id: "features", label: T.tabs.features },
  ];

  return (
    <>
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      {!plan ? null : (
        <div className="space-y-5">
          <Tabs
            items={TABS}
            value={activeTab}
            onChange={(id) => setActiveTab(id as "main" | "features")}
          />

          {activeTab === "main" ? (
            <div className="space-y-5">
              <section className="rounded-2xl border border-border-subtle bg-bg-input/40 p-3">
                <p className="mb-2 font-mono text-3xs uppercase tracking-[0.12em] text-text-sec">
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
                <p className="font-mono text-3xs uppercase tracking-[0.12em] text-text-sec">
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

              <section className="space-y-2">
                <p className="font-mono text-3xs uppercase tracking-[0.12em] text-text-sec">
                  {T.sections.inheritance}
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-text-sec">
                    {T.fields.inheritsFromLabel}
                  </span>
                  <Select
                    value={inheritsFromPlanId ?? ""}
                    onChange={(event) =>
                      setInheritsFromPlanId(event.target.value || null)
                    }
                  >
                    <option value="">{T.fields.inheritsFromNone}</option>
                    {parentCandidates.map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        {cand.code} · {cand.name}
                      </option>
                    ))}
                  </Select>
                  <span className="mt-1 block text-xs text-text-sec/70">
                    {T.fields.inheritsFromHint}
                  </span>
                </label>
              </section>

              <section className="space-y-3">
                <p className="font-mono text-3xs uppercase tracking-[0.12em] text-text-sec">
                  {T.sections.prices}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PERIODS.map((period) => {
                    const active = pricesActive[period] ?? true;
                    const effective = resolvePlanPrice(activeRows, period);
                    return (
                      <div
                        key={period}
                        className="space-y-2 rounded-xl border border-border-subtle/60 p-2.5"
                      >
                        <span className="block text-xs font-medium text-text-sec">
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
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xs text-text-sec">
                            {T.fields.priceActiveLabel}
                          </span>
                          <Switch
                            size="sm"
                            checked={active}
                            onCheckedChange={(checked) =>
                              setPricesActive({ ...pricesActive, [period]: checked })
                            }
                          />
                        </div>
                        <div className="text-2xs text-text-sec/80">
                          {T.fields.priceEffectiveLabel}{" "}
                          <span
                            className={
                              effective === null
                                ? "text-danger-text"
                                : "text-text-main"
                            }
                          >
                            {effective === null
                              ? T.fields.priceEffectiveNone
                              : moneyRUBFromKopeks(effective)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-2xs text-text-sec/70">{T.fields.priceActiveHint}</p>
                {orphanedPeriod !== null ? (
                  <p role="alert" className="text-xs text-warning-text">
                    {T.errorPriceLastActive.replace("{months}", String(orphanedPeriod))}
                  </p>
                ) : null}
              </section>
            </div>
          ) : (
            <PlanFeaturesEditor
              planId={plan.id}
              scope={plan.scope}
              inheritsFromPlanId={inheritsFromPlanId}
              overrides={features}
              onChange={setFeatures}
              allPlans={candidates}
            />
          )}

          {error ? (
            <p role="alert" className="text-xs text-danger-text">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {T.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={submitting || orphanedPeriod !== null}
            >
              {T.save}
            </Button>
          </div>
        </div>
      )}
    </ModalSurface>
    {confirmModal}
    </>
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

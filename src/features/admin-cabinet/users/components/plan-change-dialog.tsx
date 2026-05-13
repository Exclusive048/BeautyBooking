"use client";

import { useEffect, useState } from "react";
import {
  AccountType,
  PlanTier,
  SubscriptionScope,
} from "@prisma/client";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import {
  formatPlanName,
  formatScopeLabel,
} from "@/features/admin-cabinet/users/lib/plan-display";
import type {
  AdminBillingPlanOption,
  AdminUserRow,
} from "@/features/admin-cabinet/users/types";

const T = UI_TEXT.adminPanel.users.planChange;

export type PlanChangeValue = {
  planCode: string;
  periodMonths: 1 | 3 | 6 | 12;
  reason: string;
};

type Props = {
  open: boolean;
  user: AdminUserRow | null;
  plans: AdminBillingPlanOption[];
  onClose: () => void;
  onSubmit: (value: PlanChangeValue) => Promise<void>;
};

const PERIODS: Array<{ value: 1 | 3 | 6 | 12; label: string }> = [
  { value: 1, label: T.periodMonths["1"] },
  { value: 3, label: T.periodMonths["3"] },
  { value: 6, label: T.periodMonths["6"] },
  { value: 12, label: T.periodMonths["12"] },
];

/** Maps a primary role onto the scope the dialog should filter plans
 * by. CLIENT / ADMIN / SUPERADMIN return `null` — the parent should
 * not open the dialog for those rows, but we render a fallback panel
 * anyway in case the prop slips through. */
function scopeForUser(user: AdminUserRow | null): SubscriptionScope | null {
  if (!user) return null;
  const role = user.primaryRole;
  if (role === AccountType.MASTER) return SubscriptionScope.MASTER;
  if (
    role === AccountType.STUDIO ||
    role === AccountType.STUDIO_ADMIN
  ) {
    return SubscriptionScope.STUDIO;
  }
  return null;
}

const TIER_ORDER: PlanTier[] = [PlanTier.FREE, PlanTier.PRO, PlanTier.PREMIUM];

function describePlan(plan: AdminBillingPlanOption): string {
  const key = `${plan.tier.toLowerCase()}${plan.scope === SubscriptionScope.STUDIO ? "Studio" : "Master"}` as
    | "freeMaster"
    | "proMaster"
    | "premiumMaster"
    | "freeStudio"
    | "proStudio"
    | "premiumStudio";
  return T.descriptions[key] ?? "";
}

export function PlanChangeDialog({
  open,
  user,
  plans,
  onClose,
  onSubmit,
}: Props) {
  const scope = scopeForUser(user);
  const scopedPlans = scope
    ? [...plans]
        .filter((p) => p.scope === scope)
        .sort(
          (a, b) =>
            TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
        )
    : [];

  const [selectedPlanCode, setSelectedPlanCode] = useState<string>("");
  const [period, setPeriod] = useState<1 | 3 | 6 | 12>(1);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReason("");
    setPeriod(1);
    // Pre-select the user's current plan so the dialog opens on a
    // sensible default. Falls back to first available plan in scope
    // when the user has none (e.g. a freshly registered master).
    const current = user?.plan?.planCode;
    if (current && scopedPlans.some((p) => p.code === current)) {
      setSelectedPlanCode(current);
    } else {
      setSelectedPlanCode(scopedPlans[0]?.code ?? "");
    }
    // scopedPlans is derived from `plans` + `scope`; including it in
    // the dep array would recompute the identity on every render and
    // re-trigger this effect. Keying off open/user is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const submit = async () => {
    if (!selectedPlanCode) {
      setError(T.planNotFound);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        planCode: selectedPlanCode,
        periodMonths: period,
        reason: reason.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const currentPlanCode = user?.plan?.planCode ?? null;
  const sameTier =
    !!user?.plan &&
    scopedPlans.find((p) => p.code === selectedPlanCode)?.tier ===
      user.plan.tier;

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      {!user ? null : !scope ? (
        <p className="text-sm text-text-sec">{T.unavailable}</p>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border-subtle bg-bg-input/40 p-3">
            <p className="text-xs text-text-sec">{T.userLabel}</p>
            <p className="mt-0.5 text-sm font-medium text-text-main">
              {user.displayName}
            </p>
            <p className="mt-1.5 text-xs text-text-sec">
              {T.scopeLabel}:{" "}
              <span className="text-text-main">
                {formatScopeLabel(scope)}
              </span>
              {user.plan ? (
                <>
                  {" · "}
                  {T.currentLabel}:{" "}
                  <span className="text-text-main">
                    {formatPlanName(user.plan.tier, user.plan.scope)}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div>
            <p className="mb-2 block text-xs font-medium text-text-sec">
              {T.tierLabel}
            </p>
            <ul className="flex flex-col gap-2">
              {scopedPlans.map((plan) => {
                const selected = plan.code === selectedPlanCode;
                const isCurrent = plan.code === currentPlanCode;
                return (
                  <li key={plan.code}>
                    <button
                      type="button"
                      onClick={() => setSelectedPlanCode(plan.code)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                        selected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border-subtle bg-bg-card hover:border-primary/20 hover:bg-bg-input/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border-subtle bg-transparent",
                        )}
                        aria-hidden
                      >
                        {selected ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium text-text-main">
                          {plan.name}
                          {isCurrent ? (
                            <span className="rounded-full bg-bg-input px-2 py-0.5 font-mono text-[10px] uppercase text-text-sec">
                              {T.currentLabel}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-text-sec">
                          {describePlan(plan)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-sec">
              {T.periodLabel}
            </label>
            <Select
              value={String(period)}
              onChange={(event) =>
                setPeriod(Number(event.target.value) as 1 | 3 | 6 | 12)
              }
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-sec">
              {T.reasonLabel}
            </label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={T.reasonPlaceholder}
              rows={3}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-text-sec/70">{T.reasonHint}</p>
          </div>

          {sameTier && currentPlanCode === selectedPlanCode ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {T.sameTierWarning}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
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
              disabled={submitting || !selectedPlanCode}
            >
              {T.apply}
            </Button>
          </div>
        </div>
      )}
    </ModalSurface>
  );
}

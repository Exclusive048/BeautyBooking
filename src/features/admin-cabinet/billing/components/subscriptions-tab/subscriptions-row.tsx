"use client";

import { PlanTier, SubscriptionStatus } from "@prisma/client";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRublesFromKopeks } from "@/features/admin-cabinet/billing/lib/kopeks";
import {
  formatPlanName,
} from "@/features/admin-cabinet/users/lib/plan-display";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminSubscriptionRow } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.subs;
const M = UI_TEXT.adminPanel.billing.methodFallback;

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TIER_TONE: Record<PlanTier, string> = {
  [PlanTier.FREE]: "bg-bg-input text-text-sec",
  [PlanTier.PRO]: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  [PlanTier.PREMIUM]: "bg-primary/12 text-primary",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.ACTIVE]: T.statusBadge.active,
  [SubscriptionStatus.PAST_DUE]: T.statusBadge.pastDue,
  [SubscriptionStatus.CANCELLED]: T.statusBadge.cancelled,
  [SubscriptionStatus.EXPIRED]: T.statusBadge.expired,
  [SubscriptionStatus.PENDING]: T.statusBadge.pending,
};

type Props = {
  row: AdminSubscriptionRow;
  busy: boolean;
  onCancel: () => void;
};

export function SubscriptionsTableRow({ row, busy, onCancel }: Props) {
  const cancelable =
    row.status === SubscriptionStatus.ACTIVE ||
    row.status === SubscriptionStatus.PAST_DUE;
  return (
    <tr className="hover:bg-bg-input/40">
      <td className="px-4 py-3 align-top">
        <p className="text-sm font-medium text-text-main">
          {row.user.displayName}
        </p>
        {row.status !== SubscriptionStatus.ACTIVE ? (
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
            {STATUS_LABEL[row.status]}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            TIER_TONE[row.plan.tier],
          )}
        >
          {formatPlanName(row.plan.tier, row.plan.scope)}
        </span>
        {row.isTrial ? (
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-text-sec">
            trial
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top text-sm tabular-nums text-text-sec">
        {row.currentPeriodStart
          ? DATE_FMT.format(new Date(row.currentPeriodStart))
          : M}
      </td>
      <td className="px-4 py-3 align-top text-sm tabular-nums text-text-sec">
        {row.currentPeriodEnd
          ? DATE_FMT.format(new Date(row.currentPeriodEnd))
          : M}
      </td>
      <td className="px-4 py-3 text-right align-top text-sm font-semibold tabular-nums text-text-main">
        {row.amountKopeks > 0 ? formatRublesFromKopeks(row.amountKopeks) : M}
      </td>
      <td className="px-4 py-3 align-top text-xs text-text-sec">
        {row.paymentMethodDisplay ?? M}
      </td>
      <td className="px-4 py-3 align-top">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
            row.autoRenew
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
              : "bg-bg-input text-text-sec",
          )}
        >
          {row.autoRenew ? T.autoRenewOn : T.autoRenewOff}
        </span>
      </td>
      <td className="px-4 py-3 text-right align-top">
        {cancelable ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={T.cancelButton}
            title={T.cancelButton}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-700 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

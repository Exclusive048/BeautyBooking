"use client";

import { PlanTier, SubscriptionStatus } from "@/lib/prisma-enums";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { moneyRUBFromKopeks } from "@/lib/format";
import {
  formatPlanName,
} from "@/features/admin-cabinet/users/lib/plan-display";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminSubscriptionRow } from "@/features/admin-cabinet/billing/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ViewerDate } from "@/components/ui/viewer-date";

const T = UI_TEXT.adminPanel.billing.subs;
const M = UI_TEXT.adminPanel.billing.methodFallback;

const TIER_TONE: Record<PlanTier, string> = {
  [PlanTier.FREE]: "bg-bg-input text-text-sec",
  [PlanTier.PRO]: "bg-success/[0.12] text-success-text",
  [PlanTier.PREMIUM]: "bg-primary/[0.12] text-accent-text",
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
          <p className="mt-0.5 eyebrow text-warning-text">
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
          <p className="mt-0.5 eyebrow">
            trial
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top text-sm tabular-nums text-text-sec">
        {row.currentPeriodStart
          ? <ViewerDate value={row.currentPeriodStart} preset="dayMonthYearShort" />
          : M}
      </td>
      <td className="px-4 py-3 align-top text-sm tabular-nums text-text-sec">
        {row.currentPeriodEnd
          ? <ViewerDate value={row.currentPeriodEnd} preset="dayMonthYearShort" />
          : M}
      </td>
      <td className="px-4 py-3 text-right align-top text-sm font-semibold tabular-nums text-text-main">
        {row.amountKopeks > 0 ? moneyRUBFromKopeks(row.amountKopeks) : M}
      </td>
      <td className="px-4 py-3 align-top text-xs text-text-sec">
        {row.paymentMethodDisplay ?? M}
      </td>
      <td className="px-4 py-3 align-top">
        <Badge size="xs" variant={row.autoRenew ? "success" : "muted"}>
          {row.autoRenew ? T.autoRenewOn : T.autoRenewOff}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right align-top">
        {cancelable ? (
          <Button
            variant="wrapper"
            onClick={onCancel}
            disabled={busy}
            aria-label={T.cancelButton}
            title={T.cancelButton}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-danger-text transition-colors hover:bg-destructive/20"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

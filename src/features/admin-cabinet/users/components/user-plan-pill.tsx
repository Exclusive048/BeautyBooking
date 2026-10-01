"use client";

import { PlanTier, SubscriptionStatus } from "@/lib/prisma-enums";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import { formatPlanName } from "@/features/admin-cabinet/users/lib/plan-display";
import type { AdminUserPlanSnapshot } from "@/features/admin-cabinet/users/types";

const T = UI_TEXT.adminPanel.users.plan;

const TIER_TONE: Record<PlanTier, string> = {
  [PlanTier.FREE]: "bg-bg-input text-text-sec",
  [PlanTier.PRO]: "bg-success/[0.12] text-success-text",
  [PlanTier.PREMIUM]: "bg-primary/[0.12] text-accent-text",
};

type Props = {
  plan: AdminUserPlanSnapshot | null;
  onClick: () => void;
  disabled?: boolean;
};

/**
 * Clickable pill for `MASTER` / `STUDIO` subscriptions. Renders `—`
 * (plain text, not a button) when the user has no plan-bearing scope
 * — admin can't open a plan-change dialog there because the schema
 * has no MASTER/STUDIO subscription to upsert into.
 */
export function UserPlanPill({ plan, onClick, disabled }: Props) {
  if (!plan) {
    return <span className="text-sm text-text-sec">{T.empty}</span>;
  }
  const isPastDue = plan.status === SubscriptionStatus.PAST_DUE;
  return (
    <Button
      variant="wrapper"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        TIER_TONE[plan.tier],
        isPastDue && "ring-1 ring-inset ring-warning/40",
        "hover:brightness-105 disabled:opacity-60",
      )}
      title={T.change}
    >
      <span>{formatPlanName(plan.tier, plan.scope)}</span>
      {plan.isTrial ? (
        <span className="font-mono text-3xs uppercase tracking-wider text-text-sec">
          · {T.trial}
        </span>
      ) : null}
      {isPastDue ? (
        <span className="font-mono text-3xs uppercase tracking-wider text-warning-text">
          · {T.pastDue}
        </span>
      ) : null}
      <ChevronDown className="h-3 w-3" aria-hidden />
    </Button>
  );
}

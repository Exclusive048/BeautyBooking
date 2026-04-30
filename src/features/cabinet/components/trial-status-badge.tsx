"use client";

import { useEffect, useState } from "react";
import { Clock, Sparkles } from "lucide-react";
import { pluralizeDays } from "@/lib/utils/pluralize-days";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  /** Trial end timestamp as ISO string. */
  trialEndsAt: string;
};

const URGENT_THRESHOLD_DAYS = 3;
const HOUR_MS = 60 * 60 * 1000;

function calculateDaysLeft(trialEndsAt: string, now: Date = new Date()): number {
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return 0;
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

/**
 * Compact countdown badge — number of days left in the active PREMIUM trial.
 *
 * Refreshes every hour so the count rolls over without a page reload. The
 * server-side layout passes the ISO date once; recalculation is local.
 *
 * Visual states:
 *   - daysLeft > 3 → primary tint
 *   - daysLeft ≤ 3 → amber tint (matches <TrialEndingBanner>)
 *   - daysLeft = 0 → not rendered (cron will downgrade on next run)
 */
export function TrialStatusBadge({ trialEndsAt }: Props) {
  const [daysLeft, setDaysLeft] = useState(() => calculateDaysLeft(trialEndsAt));

  useEffect(() => {
    // Re-tick once an hour so the count rolls over without a page reload.
    // Initial value is set by useState's lazy initializer above — calling
    // setState synchronously here would trigger a cascading render.
    const interval = setInterval(() => {
      setDaysLeft(calculateDaysLeft(trialEndsAt));
    }, HOUR_MS);
    return () => clearInterval(interval);
  }, [trialEndsAt]);

  if (daysLeft <= 0) return null;

  const isUrgent = daysLeft <= URGENT_THRESHOLD_DAYS;
  const Icon = isUrgent ? Clock : Sparkles;
  const className = isUrgent
    ? "inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
    : "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary";

  return (
    <span className={className} aria-live="polite">
      <Icon className="h-3 w-3" aria-hidden />
      <span className="tabular-nums">
        {UI_TEXT.cabinet.trial.badgePrefix} · {daysLeft} {pluralizeDays(daysLeft)}
      </span>
    </span>
  );
}

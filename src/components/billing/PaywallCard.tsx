"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type PaywallCardProps = {
  feature?: string;
  billingHref: string;
  /** Custom description override */
  description?: string;
  /** Custom title override */
  title?: string;
};

/**
 * Full-page paywall shown when a user navigates to a feature-gated section.
 * Displays a lock icon, title, description, and upgrade CTA.
 */
export function PaywallCard({ feature, billingHref, description, title }: PaywallCardProps) {
  const t = UI_TEXT.billing.paywall;

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-border-subtle bg-bg-card/60 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-elevated">
        <Lock className="h-6 w-6 text-text-sec" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-text-main">
        {title ?? t.title}
      </h2>
      <p className="mt-2 max-w-xs text-sm text-text-sec">
        {description ?? (feature ? t.description(feature) : t.description("эту функцию"))}
      </p>
      <Button asChild className="mt-6">
        <Link href={billingHref}>{t.cta}</Link>
      </Button>
    </div>
  );
}

/**
 * Inline locked-row indicator for sidebar nav items.
 * Just the lock icon badge — no full card.
 */
export function LockBadge({ tooltip }: { tooltip?: string }) {
  const t = UI_TEXT.billing.paywall;
  return (
    <span
      title={tooltip ?? t.lockedTooltip}
      aria-label={tooltip ?? t.lockedTooltip}
      className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bg-elevated"
    >
      <Lock className="h-2.5 w-2.5 text-text-sec" aria-hidden />
    </span>
  );
}

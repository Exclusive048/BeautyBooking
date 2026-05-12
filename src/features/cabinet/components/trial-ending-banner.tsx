"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDays } from "@/lib/utils/pluralize-days";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  daysLeft: number;
};

const T = UI_TEXT.cabinet.trial;

/**
 * Full-width amber banner that appears at the top of the cabinet layout when
 * the PREMIUM trial has ≤ 3 days left. Closes via X button to in-memory state
 * only — re-appears on every page navigation by design (this is the last
 * push before silent downgrade, intentional persistence).
 */
export function TrialEndingBanner({ daysLeft }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || daysLeft <= 0 || daysLeft > 3) return null;

  let title: string;
  if (daysLeft === 1) {
    title = T.bannerTitleTomorrow;
  } else {
    title = T.bannerTitleMultiDays.replace("{countDays}", formatDays(daysLeft));
  }

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-medium text-text-main">{title}</span>
          <span className="ml-2 text-text-sec">{T.bannerDescription}</span>
        </div>
        <Button asChild variant="primary" size="sm">
          <Link href="/pricing">{T.bannerCta}</Link>
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={T.bannerDismiss}
          className="rounded-md p-1 text-text-sec transition-colors hover:bg-amber-500/15 hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminBillingTab } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.tabs;

const TABS: Array<{ key: AdminBillingTab; label: string }> = [
  { key: "plans", label: T.plans },
  { key: "subs", label: T.subs },
  { key: "payments", label: T.payments },
];

type Props = {
  active: AdminBillingTab;
};

/** All three tabs are interactive after ADMIN-BILLING-B. Active tab
 * is driven by `?tab=…` URL state — clicking writes the new tab and
 * clears tab-specific cursors so the new tab starts from page 1
 * rather than inheriting stale pagination from a previous tab. */
export function BillingTabs({ active }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const setTab = useCallback(
    (next: AdminBillingTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "plans") params.delete("tab");
      else params.set("tab", next);
      // Cursors are tab-specific — drop them on tab switch so a fresh
      // tab doesn't inherit an unrelated page.
      params.delete("subCursor");
      params.delete("payCursor");
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <nav
      className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border-subtle bg-bg-card p-1 shadow-card"
      aria-label="Billing sections"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTab(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm transition-colors",
              isActive
                ? "bg-bg-input text-text-main shadow-sm"
                : "text-text-sec hover:bg-bg-input/60 hover:text-text-main",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

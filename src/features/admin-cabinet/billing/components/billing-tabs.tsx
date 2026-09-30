"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import * as UI_TEXT from "@/lib/ui/text";
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
    <SegmentedTabs<AdminBillingTab>
      value={active}
      onChange={setTab}
      ariaLabel={T.navAria}
      className="w-full sm:max-w-xl"
      options={TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
    />
  );
}

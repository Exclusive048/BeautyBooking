"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminReportStatusTab,
  AdminReportTypeFilter,
  AdminReportsCounts,
} from "@/features/admin-cabinet/reports/types";

const T = UI_TEXT.adminPanel.reports;

const TABS: Array<{ value: AdminReportStatusTab; countKey: keyof AdminReportsCounts }> = [
  { value: "new", countKey: "new" },
  { value: "resolved", countKey: "resolved" },
  { value: "dismissed", countKey: "dismissed" },
  { value: "all", countKey: "all" },
];

const TYPE_OPTIONS = Object.keys(T.targetTypes) as Array<keyof typeof T.targetTypes>;

type Props = {
  status: AdminReportStatusTab;
  type: AdminReportTypeFilter;
  counts: AdminReportsCounts;
};

/** Вкладки по состоянию + тип контента. Источник правды — адрес страницы (replace, не push). */
export function ReportsFilters({ status, type, counts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const pushParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mutator(params);
      params.delete("cursor");
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
      <Tabs
        ariaLabel={T.filters.tabsAria}
        items={TABS.map((tab) => ({
          id: tab.value,
          label: T.tabs[tab.value],
          badge: counts[tab.countKey],
        }))}
        value={status}
        onChange={(id) =>
          pushParams((params) => {
            if (id === "new") params.delete("status");
            else params.set("status", id);
          })
        }
      />

      <Select
        value={type}
        aria-label={T.filters.typeLabel}
        onChange={(event) =>
          pushParams((params) => {
            const next = event.target.value;
            if (next === "all") params.delete("type");
            else params.set("type", next);
          })
        }
        className="h-10 min-w-[14rem]"
      >
        <option value="all">{T.filters.typeAll}</option>
        {TYPE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {T.targetTypes[option]}
          </option>
        ))}
      </Select>
    </div>
  );
}

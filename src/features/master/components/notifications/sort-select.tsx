"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp } from "lucide-react";
import type { NotificationSort } from "./lib/group-by-day";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.notifications.sort;

type Props = {
  value: NotificationSort;
};

/**
 * Tiny client island that pushes `?sort=` into the URL. Keeps the page
 * server-rendered — only this dropdown is hydrated. Uses `replace` so the
 * tab/sort interaction doesn't pollute browser history with one entry per
 * select change.
 */
export function SortSelect({ value }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "newest") {
      params.delete("sort");
    } else {
      params.set("sort", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-card px-3 py-2 text-sm">
      <ArrowDownUp className="h-3.5 w-3.5 text-text-sec" aria-hidden />
      <span className="sr-only">{T.label}</span>
      <select
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="bg-transparent text-text-main outline-none"
      >
        <option value="newest">{T.newest}</option>
        <option value="oldest">{T.oldest}</option>
      </select>
    </label>
  );
}

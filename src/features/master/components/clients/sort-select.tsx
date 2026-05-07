"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp } from "lucide-react";
import type { ClientsSortId } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.sort;

type Props = {
  value: ClientsSortId;
};

/**
 * Sort dropdown — small client island. Mirrors the notifications page's
 * sort select so users encounter the same control twice with identical
 * behaviour: change pushes `?sort=` via `router.replace` (no history
 * pollution).
 */
export function ClientsSortSelect({ value }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "recent") {
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
        <option value="recent">{T.recent}</option>
        <option value="alphabetical">{T.alphabetical}</option>
        <option value="ltv_desc">{T.ltvDesc}</option>
      </select>
    </label>
  );
}

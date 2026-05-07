"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.search;
const DEBOUNCE_MS = 300;

type Props = {
  defaultValue: string;
};

/**
 * Debounced search box. Server stays the source of truth: typing pushes
 * `?q=` into the URL via `router.replace`, which re-runs the page server
 * fetch with the new search. `defaultValue` is the value rendered on the
 * server, so the input is hydrated with the live query without an
 * intermediate empty state.
 *
 * State sync to props uses the React 19 documented "compare during
 * render" pattern (no useEffect → no `react-hooks/set-state-in-effect`
 * violation). The debounced URL push is the only effect; it compares the
 * current input against `?q=` directly so an inbound URL change is
 * trivially "no work needed".
 */
export function ClientsSearchInput({ defaultValue }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const [prevDefault, setPrevDefault] = useState(defaultValue);

  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue);
    setValue(defaultValue);
  }

  useEffect(() => {
    const currentQ = searchParams.get("q") ?? "";
    const trimmed = value.trim();
    if (trimmed === currentQ) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      // Reset selected client when the search changes — the previous one
      // may not match the new filter.
      params.delete("id");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, pathname, router, searchParams]);

  return (
    <label className="relative block">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={T.placeholder}
        aria-label={T.ariaLabel}
        className="h-10 rounded-xl pl-9 pr-3 text-sm"
      />
    </label>
  );
}

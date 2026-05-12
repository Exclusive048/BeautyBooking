"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ChevronDown } from "lucide-react";
import { fetchJson } from "@/lib/http/client";
import { getCurrentCitySlug, setCurrentCitySlug } from "@/lib/cities/client-city";
import { UI_TEXT } from "@/lib/ui/text";

type CityItem = {
  id: string;
  slug: string;
  name: string;
  nameGenitive: string | null;
  latitude: number;
  longitude: number;
};

type CitiesResponse = { items: CityItem[] };

const fetcher = (url: string) => fetchJson<CitiesResponse>(url);

export function CitySelector() {
  const [open, setOpen] = useState(false);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { data } = useSWR<CitiesResponse>("/api/cities", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Hydrate from localStorage / cookie after mount (avoids SSR mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentSlug(getCurrentCitySlug());
  }, []);

  // Click-outside handler.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  const T = UI_TEXT.cities.selector;
  const cities = data?.items ?? [];

  // Render nothing if there are no cities AND user hasn't picked one — there
  // is nothing to choose from. The first-visit popup handles this state.
  if (cities.length === 0 && !currentSlug) return null;

  // Deactivated-city fallback: cookie may hold a slug that's no longer in
  // /api/cities (deactivated, or lost all published providers). We do NOT
  // clear the cookie — temporary deactivation should not destroy the user's
  // choice. Display the generic "Сменить город" label instead of the name.
  const currentCity = cities.find((c) => c.slug === currentSlug) ?? null;
  const buttonLabel = currentCity?.name ?? T.choose;

  const handleSelect = (slug: string) => {
    setCurrentCitySlug(slug);
    setOpen(false);
    // Reload so server components (catalog SSR with cityId) refetch with the
    // new cookie value.
    window.location.reload();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={T.label}
        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-medium text-text-main transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="max-w-[140px] truncate">{buttonLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && cities.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 max-h-[320px] min-w-[200px] overflow-y-auto rounded-xl border border-border-subtle bg-bg-card py-1 shadow-lg"
        >
          {cities.map((city) => {
            const isCurrent = city.slug === currentSlug;
            return (
              <li key={city.id} role="option" aria-selected={isCurrent}>
                <button
                  type="button"
                  onClick={() => handleSelect(city.slug)}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                    isCurrent ? "font-medium text-primary" : "text-text-main"
                  }`}
                >
                  {city.name}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

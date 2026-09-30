"use client";

import { useEffect, useRef, useState } from "react";
import { AnchoredPortal } from "@/components/ui/anchored-portal";
import useSWR from "swr";
import { ChevronDown } from "lucide-react";
import { fetchJson } from "@/lib/http/client";
import { getCurrentCitySlug, setCurrentCitySlug } from "@/lib/cities/client-city";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

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
  // CITY-LIST-FRESH-01: список перечитывается при возврате в приложение и при
  // каждом открытии выпадашки. С `revalidateOnFocus: false` он загружался
  // ОДИН раз за жизнь страницы, а PWA живёт сутками без перезагрузки: город,
  // где только что появился мастер, не попадал в список, пока приложение не
  // переоткроют.
  const { data, mutate } = useSWR<CitiesResponse>("/api/cities", fetcher, {
    dedupingInterval: 10_000,
  });

  // Hydrate from localStorage / cookie after mount (avoids SSR mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentSlug(getCurrentCitySlug());
  }, []);


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
      <Button variant="wrapper"
        onClick={() => {
          if (!open) void mutate();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={T.label}
        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-medium text-text-main transition-colors hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="max-w-[140px] truncate">{buttonLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </Button>

      {/* 29.09 доработки · 21: список — порталом (`z-popover`), иначе он
          жил на уровне шапки и уходил под нижнюю навигацию. Клик вне и Escape
          закрывают его там же. */}
      <AnchoredPortal open={open && cities.length > 0} anchorRef={containerRef} onDismiss={() => setOpen(false)}>
      {open && cities.length > 0 ? (
        <ul
          role="listbox"
          className="max-h-[320px] min-w-[200px] overflow-y-auto rounded-xl border border-border-subtle bg-bg-card py-1 shadow-lg"
        >
          {cities.map((city) => {
            const isCurrent = city.slug === currentSlug;
            return (
              <li key={city.id} role="option" aria-selected={isCurrent}>
                <Button variant="wrapper"
                  onClick={() => handleSelect(city.slug)}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                    isCurrent ? "font-medium text-accent-text" : "text-text-main"
                  }`}
                >
                  {city.name}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      </AnchoredPortal>
    </div>
  );
}

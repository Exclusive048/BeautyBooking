"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { X } from "lucide-react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { fetchJson } from "@/lib/http/client";
import { getCurrentCitySlug, setCurrentCitySlug } from "@/lib/cities/client-city";
import { UI_TEXT } from "@/lib/ui/text";

type CityItem = {
  id: string;
  slug: string;
  name: string;
};

type CitiesResponse = { items: CityItem[] };

const fetcher = (url: string) => fetchJson<CitiesResponse>(url);

// Routes where the prompt should never appear — admin and cabinet are tools,
// not exploration. Public catalog/feed/profiles all benefit from a city pick.
const HIDDEN_PATH_PREFIXES = ["/admin", "/cabinet"];

export function CityPromptOverlay() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { data, isLoading } = useSWR<CitiesResponse>("/api/cities", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // After mount: decide whether to show. Done in effect (not during render)
  // so SSR doesn't try to read localStorage / cookie via this component.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    if (HIDDEN_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
      setShow(false);
      return;
    }
    const slug = getCurrentCitySlug();
    setShow(!slug);
  }, [pathname]);

  if (!hydrated || isLoading) return null;

  const cities = data?.items ?? [];
  const T = UI_TEXT.cities.prompt;

  const handleChoose = (slug: string) => {
    setCurrentCitySlug(slug);
    setShow(false);
    window.location.reload();
  };

  const handleClose = () => {
    // Don't write a city — user dismissed without picking. The selector in the
    // navbar still says "Сменить город" until they pick. We just hide the
    // overlay for this navigation; it won't pop up again until SPA reload OR
    // until they reach a path that re-mounts the overlay.
    setShow(false);
  };

  // OVERLAY-PORTAL-REFACTOR-01: was a hand-rolled `fixed inset-0` overlay
  // (positioning hazard — broke under any transformed ancestor). Now portals
  // through <ModalSurface size="sm"> (max-w-md preserved). Gains focus-trap,
  // return-focus, initial-focus, body scroll-lock, Escape + backdrop-click
  // close — all previously absent. `handleClose` (hide without writing a city)
  // now also runs on Escape / backdrop, semantically identical to the × button.
  // Heading kept as an in-panel <h2> to preserve its text-2xl display size.
  return (
    <ModalSurface open={show} onClose={handleClose} size="sm">
      <button
        type="button"
        onClick={handleClose}
        aria-label={T.close}
        className="absolute right-3 top-3 -m-2 rounded-lg p-3.5 text-text-sec transition-colors hover:bg-muted hover:text-text-main"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <h2 id="city-prompt-title" className="font-display text-2xl font-semibold text-text-main">
        {T.title}
      </h2>
      <p className="mt-2 text-sm text-text-sec">
        {cities.length > 0 ? T.description : T.descriptionEmpty}
      </p>

      {cities.length > 0 ? (
        <div className="mt-6 max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {cities.map((city) => (
            <button
              key={city.id}
              type="button"
              onClick={() => handleChoose(city.slug)}
              className="flex w-full items-center justify-between rounded-xl border border-border-subtle/60 px-4 py-3 text-left text-sm font-medium text-text-main transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span>{city.name}</span>
              <span aria-hidden className="text-text-sec">→</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-border-subtle/60 p-6 text-center text-sm text-text-sec">
          {T.empty}
        </p>
      )}

      <p className="mt-5 text-center text-xs text-text-sec">{T.note}</p>
    </ModalSurface>
  );
}

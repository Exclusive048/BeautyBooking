"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
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

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="city-prompt-title"
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md rounded-2xl border border-border-subtle/40 bg-bg-card p-6 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleClose}
              aria-label={T.close}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-text-sec transition-colors hover:bg-muted hover:text-text-main"
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
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

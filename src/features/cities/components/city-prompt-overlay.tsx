"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { X } from "lucide-react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { fetchJson } from "@/lib/http/client";
import {
  dismissCityPrompt,
  getCurrentCitySlug,
  isCityPromptDismissed,
  setCurrentCitySlug,
} from "@/lib/cities/client-city";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

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
  // CITY-LIST-FRESH-01: ключ общий с селектором в шапке — политика
  // перечитывания одна (см. `city-selector.tsx`).
  const { data, isLoading } = useSWR<CitiesResponse>("/api/cities", fetcher, {
    dedupingInterval: 10_000,
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
    // PWA-FIX-01: закрытый попап остаётся закрытым (см. `dismissCityPrompt`).
    setShow(!slug && !isCityPromptDismissed());
  }, [pathname]);

  const cities = data?.items ?? [];

  // PWA-FIX-01: попап без единого города — модальный тупик. Он перекрывал
  // страницу на каждом переходе, блокировал прокрутку и предлагал ВЫБРАТЬ из
  // пустого списка («Платформа только запускается»), то есть закрыть его было
  // единственным доступным действием. Диалог выбора имеет смысл ровно тогда,
  // когда есть из чего выбирать; сообщение «городов пока нет» — не повод
  // прерывать просмотр. Проверено на проде 2026-09-01: `/api/cities` отдавал
  // `[]`, и попап всплывал на КАЖДОЙ публичной навигации.
  if (!hydrated || isLoading || cities.length === 0) return null;

  const T = UI_TEXT.cities.prompt;

  const handleChoose = (slug: string) => {
    setCurrentCitySlug(slug);
    setShow(false);
    window.location.reload();
  };

  const handleClose = () => {
    // Don't write a city — user dismissed without picking. The selector in the
    // navbar still says "Сменить город" until they pick.
    // PWA-FIX-01: отказ ЗАПОМИНАЕТСЯ (30 дней). Раньше он жил только в стейте
    // компонента, а решение показывать пересчитывалось в эффекте по `pathname`
    // — то есть каждый переход возвращал попап, и «закрыть» не значило ничего.
    dismissCityPrompt();
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
      <Button variant="wrapper"
        onClick={handleClose}
        aria-label={T.close}
        className="absolute right-3 top-3 -m-2 rounded-lg p-3.5 text-text-sec transition-colors hover:bg-muted hover:text-text-main"
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>

      <h2 id="city-prompt-title" className="font-display text-2xl font-semibold text-text-main">
        {T.title}
      </h2>
      <p className="mt-2 text-sm text-text-sec">{T.description}</p>

      <div className="mt-6 max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {cities.map((city) => (
          <Button variant="wrapper"
            key={city.id}
            onClick={() => handleChoose(city.slug)}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle/60 px-4 py-3 text-left text-sm font-medium text-text-main transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span>{city.name}</span>
            <span aria-hidden className="text-text-sec">→</span>
          </Button>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-text-sec">{T.note}</p>
    </ModalSurface>
  );
}

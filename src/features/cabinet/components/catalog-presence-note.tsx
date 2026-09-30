"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { cn } from "@/lib/cn";
import type { CatalogPresence } from "@/lib/providers/catalog-presence";
import { fetchJsonWithAuth } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinet.catalogPresence;

type Props = {
  type: "master" | "studio";
  /**
   * Значение, при смене которого статус перечитывается (например, положение
   * переключателя видимости). Автосейв успевает дойти до сервера — поэтому с
   * небольшой задержкой.
   */
  refreshKey?: unknown;
  className?: string;
};

async function fetchPresence(url: string): Promise<CatalogPresence | null> {
  // Фон: строка статуса; не прочитали — строки нет, SWR повторит.
  try {
    return await fetchJsonWithAuth<CatalogPresence>(url, { cache: "no-store" });
  } catch {
    return null;
  }
}

/**
 * VISIBILITY-CATALOG-STATUS (2026-09-23) — одна строка: кабинет в каталоге или
 * чего не хватает. Условия выводит сервер (`resolveCatalogPresence`) из того же
 * правила, что и выдача каталога, — клиент ничего не решает сам.
 */
export function CatalogPresenceNote({ type, refreshKey, className }: Props) {
  const { data, mutate } = useSWR(`/api/me/catalog-presence?type=${type}`, fetchPresence, {
    revalidateOnFocus: true,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => void mutate(), 1500);
    return () => window.clearTimeout(timer);
  }, [refreshKey, mutate]);

  if (!data) return null;

  if (data.listed) {
    return (
      <p className={cn("text-xs text-success-text", className)} data-testid="catalog-presence" data-guide="catalog">
        {type === "studio" ? T.listedStudio : T.listedMaster}
      </p>
    );
  }

  const labels = type === "studio" ? T.gapsStudio : T.gapsMaster;
  return (
    <p className={cn("text-xs text-warning-text", className)} data-testid="catalog-presence" data-guide="catalog">
      {T.notListedPrefix} {data.gaps.map((gap) => labels[gap]).join(", ")}.
    </p>
  );
}

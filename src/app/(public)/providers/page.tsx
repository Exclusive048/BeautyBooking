"use client";

import { useEffect, useMemo, useState } from "react";
import { Section } from "@/components/ui/section";
import { ProviderCard } from "@/features/catalog/components/provider-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";

import type { ProviderCardModel } from "@/features/catalog/types";
import { CatalogFilters, CatalogFiltersState } from "@/features/catalog/components/filters";

type Tab = "all" | "masters" | "studios";

const initialFilters: CatalogFiltersState = {
  query: "",
  category: "",
  district: "",
  priceMin: "",
  priceMax: "",
  onlyAvailableToday: false,
};

function toNumberSafe(v: string): number | null {
  const cleaned = v.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function ProvidersPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [filters, setFilters] = useState<CatalogFiltersState>(initialFilters);

  // ✅ данные из API
  const [providers, setProviders] = useState<ProviderCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/providers", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ providers: ProviderCardModel[] }>
          | null;

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        if (!json || !json.ok) {
          const message = json?.error?.message ?? "Failed to load providers";
          throw new Error(message);
        }

        if (alive) setProviders(json.data.providers);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(() => {
    const masters = providers.filter((p) => p.type === "MASTER").length;
    const studios = providers.filter((p) => p.type === "STUDIO").length;
    return { all: providers.length, masters, studios };
  }, [providers]);

  const filtered: ProviderCardModel[] = useMemo(() => {
    let items = [...providers];

    // tab
    if (tab === "masters") items = items.filter((p) => p.type === "MASTER");
    if (tab === "studios") items = items.filter((p) => p.type === "STUDIO");

    // only available today
    if (filters.onlyAvailableToday) {
      items = items.filter((p) => p.availableToday === true);
    }

    // search (name/tagline/categories)
    const q = filters.query.trim().toLowerCase();
    if (q) {
      items = items.filter((p) => {
        const haystack = [
          p.name,
          p.tagline,
          p.district,
          p.address,
          ...(p.categories ?? []),
          p.type === "MASTER" ? "мастер" : "студия",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      });
    }

    // category
    if (filters.category) {
      items = items.filter((p) => (p.categories ?? []).includes(filters.category));
    }

    // district
    if (filters.district) {
      items = items.filter((p) => p.district === filters.district);
    }

    // price
    const min = toNumberSafe(filters.priceMin);
    const max = toNumberSafe(filters.priceMax);

    if (min !== null) items = items.filter((p) => p.priceFrom >= min);
    if (max !== null) items = items.filter((p) => p.priceFrom <= max);

    // sort by rating desc (MVP)
    items.sort((a, b) => b.rating - a.rating);

    return items;
  }, [tab, filters, providers]);

  return (
    <div className="space-y-6">
      <Section
        title="Каталог"
        subtitle="Данные идут из Supabase (через API)."
        right={
          <Tabs
            value={tab}
            onChange={(id) => {
              if (id === "all" || id === "masters" || id === "studios") setTab(id);
            }}
            items={[
              { id: "all", label: "Все", badge: counts.all },
              { id: "masters", label: "Мастера", badge: counts.masters },
              { id: "studios", label: "Студии", badge: counts.studios },
            ]}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* LEFT */}
        <div className="space-y-4 lg:sticky lg:top-24 h-fit">
          <CatalogFilters
            providers={providers}
            value={filters}
            onChange={setFilters}
            onReset={() => setFilters(initialFilters)}
          />

          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-neutral-900">Подсказка MVP</div>
              <p className="mt-2 text-sm text-neutral-600">
                Дальше: подключим профиль провайдера + реальные записи.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>supabase</Badge>
                <Badge>prisma</Badge>
                <Badge>api</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-6">
                <div className="text-sm font-semibold text-neutral-900">Загрузка каталога…</div>
                <div className="mt-2 text-sm text-neutral-600">Тянем провайдеров из базы.</div>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-6">
                <div className="text-sm font-semibold text-neutral-900">Ошибка загрузки</div>
                <div className="mt-2 text-sm text-neutral-600">{error}</div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-neutral-600">
                  Найдено: <span className="font-semibold text-neutral-900">{filtered.length}</span>
                </div>
                <div className="text-xs text-neutral-500">Сортировка: рейтинг ↓</div>
              </div>

              {filtered.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm font-semibold text-neutral-900">Ничего не найдено</div>
                    <div className="mt-2 text-sm text-neutral-600">
                      Попробуй сбросить фильтры или выбрать другую категорию.
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {filtered.map((p) => (
                    <ProviderCard key={p.id} p={p} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

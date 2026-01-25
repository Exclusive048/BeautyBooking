"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/ui/section";
import { CatalogFilters } from "@/features/catalog/components/filters";
import { providersMock } from "@/features/catalog/data/mock";
import { ProviderCard } from "@/features/catalog/components/provider-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CatalogFiltersState } from "@/features/catalog/components/filters";
import type { ProviderCardModel } from "@/features/catalog/model/types";

const initialFilters: CatalogFiltersState = {
  query: "",
  category: "",
  district: "",
  priceMin: "",
  priceMax: "",
  onlyAvailableToday: false,
};

function toNumberSafe(value: string): number | null {
  const cleaned = value.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ProvidersPage() {
  const [filters, setFilters] = useState<CatalogFiltersState>(initialFilters);
  const providers = providersMock as ProviderCardModel[];

  const filtered = useMemo(() => {
    let items = [...providers];

    if (filters.onlyAvailableToday) {
      items = items.filter((p) => p.availableToday === true);
    }

    const q = filters.query.trim().toLowerCase();
    if (q) {
      items = items.filter((p) => {
        const haystack = [
          p.name,
          p.tagline,
          p.district,
          p.address,
          ...(p.categories ?? []),
          p.type === "MASTER" ? "master" : "studio",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      });
    }

    if (filters.category) {
      items = items.filter((p) => (p.categories ?? []).includes(filters.category));
    }

    if (filters.district) {
      items = items.filter((p) => p.district === filters.district);
    }

    const min = toNumberSafe(filters.priceMin);
    const max = toNumberSafe(filters.priceMax);
    if (min !== null) items = items.filter((p) => p.priceFrom >= min);
    if (max !== null) items = items.filter((p) => p.priceFrom <= max);

    items.sort((a, b) => b.rating - a.rating);
    return items;
  }, [filters, providers]);

  return (
    <div className="space-y-6">
      <Section
        title="Featured Providers"
        subtitle="Search by service, price, and district. Find the right fit for you."
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
              <div className="text-sm font-semibold text-neutral-900">MVP Highlights</div>
              <p className="mt-2 text-sm text-neutral-600">
                Includes: studio schedule, booking flow, and management of services and masters.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>free trial</Badge>
                <Badge>online booking</Badge>
                <Badge>fast launch</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-neutral-600">
              Results: <span className="font-semibold text-neutral-900">{filtered.length}</span>
            </div>
            <div className="flex gap-2">
              <button className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
                Sort: rating
              </button>
              <button className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
                Filter: open now
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((p) => (
              <ProviderCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

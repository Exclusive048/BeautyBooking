"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/ui/section";
import { CatalogFilters } from "@/features/catalog/components/filters";
import { providersMock } from "@/features/catalog/data/mock";
import { ProviderCard } from "@/features/catalog/components/provider-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import type { ProviderCardModel } from "@/features/catalog/types";

type Tab = "all" | "masters" | "studios";

export default function ProvidersPage() {
  const [tab, setTab] = useState<Tab>("all");

  const counts = useMemo(() => {
    const masters = providersMock.filter((p) => p.type === "MASTER").length;
    const studios = providersMock.filter((p) => p.type === "STUDIO").length;
    return { all: providersMock.length, masters, studios };
  }, []);

  const filtered: ProviderCardModel[] = useMemo(() => {
    if (tab === "all") return providersMock;
    if (tab === "masters") return providersMock.filter((p) => p.type === "MASTER");
    return providersMock.filter((p) => p.type === "STUDIO");
  }, [tab]);

  return (
    <div className="space-y-6">
      <Section
        title="Каталог"
        subtitle="Фильтруй по услуге, району и цене. Дальше добавим свободные слоты."
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
        <div className="space-y-4 lg:sticky lg:top-24 h-fit">
          <CatalogFilters />

          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-neutral-900">Подсказка MVP</div>
              <p className="mt-2 text-sm text-neutral-600">
                Скоро: “Свободно сегодня”, “Рядом со мной”, сортировка по рейтингу и цене.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>free trial</Badge>
                <Badge>модерация</Badge>
                <Badge>быстрая запись</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="text-sm text-neutral-600">
            Найдено: <span className="font-semibold text-neutral-900">{filtered.length}</span>
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

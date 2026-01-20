import { Section } from "@/components/ui/section";
import { CatalogFilters } from "@/features/catalog/components/filters";
import { providersMock } from "@/features/catalog/data/mock";
import { ProviderCard } from "@/features/catalog/components/provider-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ProvidersPage() {
  return (
    <div className="space-y-6">
      <Section
        title="Каталог мастеров"
        subtitle="Фильтруй по услуге, району и цене. Дальше добавим свободные слоты."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* LEFT */}
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

        {/* RIGHT */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-neutral-600">
              Найдено: <span className="font-semibold text-neutral-900">{providersMock.length}</span>
            </div>
            <div className="flex gap-2">
              <button className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
                Сортировка: Рейтинг
              </button>
              <button className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
                Свободно: Любой день
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {providersMock.map((p) => (
              <ProviderCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

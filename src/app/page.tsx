import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { providersMock } from "@/features/catalog/data/mock";
import { ProviderCard } from "@/features/catalog/components/provider-card";
import { Badge } from "@/components/ui/badge";

const categories = [
  { title: "Маникюр", hint: "покрытие, дизайн" },
  { title: "Ресницы", hint: "2D/3D, ламинирование" },
  { title: "Брови", hint: "коррекция, окрашивание" },
  { title: "Барбер", hint: "фейд, борода" },
  { title: "Массаж", hint: "спина, шея" },
  { title: "Визаж", hint: "макияж" },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-neutral-200 bg-white shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900/10 via-transparent to-transparent" />
        <div className="relative grid gap-8 p-6 md:grid-cols-2 md:items-center md:p-10">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge>МVP</Badge>
              <Badge>город → потом масштаб</Badge>
              <Badge>как “ПроДокторов”</Badge>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
              Запись к бьюти-мастерам{" "}
              <span className="text-neutral-500">в одном месте</span>
            </h1>

            <p className="mt-4 text-base text-neutral-600 md:text-lg">
              Выбирай услугу, смотри работы и бронируй время. Всё прозрачно: цены, локация, свободные слоты.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/providers">Открыть каталог</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/provider">Я мастер</Link>
              </Button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <Card className="bg-neutral-50">
                <CardContent className="p-4">
                  <div className="text-xs text-neutral-500">Мастеров</div>
                  <div className="mt-1 text-xl font-semibold">120+</div>
                </CardContent>
              </Card>
              <Card className="bg-neutral-50">
                <CardContent className="p-4">
                  <div className="text-xs text-neutral-500">Записей/мес</div>
                  <div className="mt-1 text-xl font-semibold">1 500+</div>
                </CardContent>
              </Card>
              <Card className="bg-neutral-50">
                <CardContent className="p-4">
                  <div className="text-xs text-neutral-500">Средний рейтинг</div>
                  <div className="mt-1 text-xl font-semibold">4.8</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Search Card */}
          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-neutral-900">Быстрый поиск</div>
              <p className="mt-1 text-xs text-neutral-500">
                В MVP — статично. Дальше подключим поиск и гео.
              </p>

              <div className="mt-4 grid gap-3">
                <Input placeholder="Услуга (маникюр / ресницы / барбер…)" />
                <Input placeholder="Район / адрес" />
                <Button asChild>
                  <Link href="/providers">Найти</Link>
                </Button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-3">
                {categories.slice(0, 6).map((c) => (
                  <Link
                    key={c.title}
                    href="/providers"
                    className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-left hover:bg-neutral-100"
                  >
                    <div className="text-sm font-semibold text-neutral-900">{c.title}</div>
                    <div className="mt-1 text-xs text-neutral-500">{c.hint}</div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* POPULAR */}
      <Section
        title="Популярные рядом"
        subtitle="Подборка для демо. Потом будет по гео/рейтингу/конверсии."
        right={
          <Link className="text-sm text-neutral-700 hover:underline" href="/providers">
            Смотреть все →
          </Link>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          {providersMock.map((p) => (
            <ProviderCard key={p.id} p={p} />
          ))}
        </div>
      </Section>
    </div>
  );
}

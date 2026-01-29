import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { providersMock } from "@/features/catalog/data/mock";
import { ProviderCard } from "@/features/catalog/components/provider-card";

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
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 sm:px-6 lg:px-8">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-[var(--shadow)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(198,169,126,0.15),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.15),transparent_45%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(198,169,126,0.15),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.06),transparent_45%)]" />
        <div className="relative grid gap-8 p-6 md:grid-cols-2 md:items-center md:p-10">
          <div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[rgb(var(--text))] md:text-5xl">
              Запись к бьюти-мастерам{" "}
              <span className="text-[rgb(var(--text-muted))]">в одном месте</span>
            </h1>

            <p className="mt-4 text-base text-[rgb(var(--text-muted))] md:text-lg">
              Выбирай услугу, смотри работы и бронируй время. Всё прозрачно: цены,
              локации, свободные слоты.
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
              {[
                { label: "Салонов", value: "120+" },
                { label: "Мастеров/студий", value: "1 500+" },
                { label: "Средняя оценка", value: "4.8" },
              ].map((stat) => (
                <Card key={stat.label} className="bg-[rgb(var(--muted))]">
                  <CardContent className="p-4">
                    <div className="text-xs text-[rgb(var(--text-muted))]">{stat.label}</div>
                    <div className="mt-1 text-xl font-semibold text-[rgb(var(--text))]">
                      {stat.value}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Search Card */}
          <Card className="bg-[rgb(var(--card))]">
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-[rgb(var(--text))]">Быстрый поиск</div>

              <div className="mt-4 grid gap-3">
                <Input placeholder="Услуга (маникюр / ресницы / массаж)" />
                <Input placeholder="Район / адрес" />
                <Button asChild>
                  <Link href="/providers">Найти</Link>
                </Button>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {categories.slice(0, 6).map((c) => (
                  <Link
                    key={c.title}
                    href="/providers"
                    className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--muted))] px-3 py-2 text-left text-xs font-medium text-[rgb(var(--text))] transition hover:-translate-y-[1px] hover:bg-[rgb(var(--card))]"
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* POPULAR */}
      <Section
        title="Популярное"
        subtitle="Подборка на сегодня. Сортируем по цене, рейтингу и локации."
        right={
          <Link className="text-sm text-[rgb(var(--text-muted))] hover:underline" href="/providers">
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
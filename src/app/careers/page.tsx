import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Вакансии — МастерРядом",
  description: "Открытые вакансии в МастерРядом. Строим лучший маркетплейс для мастеров красоты.",
};

export default function CareersPage() {
  return (
    <main className="mx-auto max-w-[800px] px-4 py-12 md:py-20 space-y-12">

      {/* Hero */}
      <section className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Вакансии
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          Строим вместе
        </h1>
        <p className="text-text-sec text-lg max-w-[500px]">
          МастерРядом — небольшая команда, которая делает большой продукт. Нам важны
          люди, которые думают о пользователях и умеют работать в условиях неопределённости.
        </p>
      </section>

      {/* No openings */}
      <div className="lux-card rounded-[24px] bg-bg-card p-10 text-center space-y-4">
        <div className="text-4xl">👀</div>
        <h2 className="text-xl font-semibold text-text-main">Открытых вакансий пока нет</h2>
        <p className="text-text-sec text-sm max-w-[380px] mx-auto leading-relaxed">
          Но мы всегда рады талантливым людям. Если вы чувствуете, что можете быть
          полезны — напишите нам напрямую с рассказом о себе.
        </p>
        <a
          href="mailto:jobs@МастерРядом.ru"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-bg-input px-6 text-sm font-semibold text-text-main hover:bg-bg-card transition-colors"
        >
          Написать в команду →
        </a>
      </div>

      {/* Culture */}
      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-text-main">Как мы работаем</h2>
        <div className="grid gap-3">
          {[
            ["🌍", "Удалённо", "Работаем из любой точки мира. Асинхронная коммуникация по умолчанию."],
            ["🚀", "Быстрые итерации", "Маленькие задачи, короткие циклы. Видите результат своей работы каждую неделю."],
            ["💬", "Открытость", "Решения обсуждаются в команде. Ваше мнение имеет значение независимо от должности."],
            ["📈", "Рост вместе с продуктом", "Ранняя команда — это опционы, история и влияние на продукт."],
          ].map(([icon, title, desc]) => (
            <div key={title as string} className="flex gap-4 items-start lux-card rounded-[16px] bg-bg-card p-5">
              <span className="text-xl shrink-0">{icon}</span>
              <div>
                <p className="font-semibold text-text-main text-sm">{title}</p>
                <p className="text-text-sec text-sm leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}


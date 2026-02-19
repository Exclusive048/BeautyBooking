import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Партнёрам — BeautyHub",
  description: "Сотрудничество с BeautyHub: интеграции, партнёрская программа, совместные проекты. Контакты для связи.",
};

const PARTNERSHIP_TYPES = [
  {
    icon: "🔗",
    title: "Технические интеграции",
    desc: "Если у вас есть CRM, POS-система, сервис SMS-уведомлений или другой инструмент для beauty-индустрии — давайте обсудим интеграцию.",
  },
  {
    icon: "📢",
    title: "Маркетинг и коллаборации",
    desc: "Совместные акции, кросс-промо, размещение у партнёров. Подходит для брендов косметики, образовательных платформ, медиа.",
  },
  {
    icon: "🏫",
    title: "Школы и курсы",
    desc: "Обучаете мастеров? Предлагаем специальные условия для студентов и преподавателей — регистрация на платформе и первые месяцы по льготной ставке.",
  },
  {
    icon: "🏢",
    title: "Корпоративным клиентам",
    desc: "Компании, которые хотят организовать beauty-услуги для сотрудников — напишите нам, обсудим корпоративные условия.",
  },
];

export default function PartnersPage() {
  return (
    <main className="mx-auto max-w-[860px] px-4 py-12 md:py-20 space-y-16">

      {/* Hero */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Партнёрам
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main tracking-tight">
          Давайте сделаем{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            что-то вместе
          </span>
        </h1>
        <p className="text-text-sec text-lg max-w-[520px] mx-auto">
          BeautyHub открыт к сотрудничеству. Если видите точку пересечения —
          напишите, разберёмся.
        </p>
      </section>

      {/* Partnership types */}
      <section className="grid md:grid-cols-2 gap-4">
        {PARTNERSHIP_TYPES.map((p) => (
          <div key={p.title} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
            <span className="text-2xl shrink-0">{p.icon}</span>
            <div>
              <p className="font-semibold text-text-main mb-1">{p.title}</p>
              <p className="text-sm text-text-sec leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Contact */}
      <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-6">
        <h2 className="text-xl font-semibold text-text-main">Напишите нам</h2>
        <p className="text-text-sec text-sm leading-relaxed">
          Расскажите коротко о себе и идее — ответим в течение рабочего дня.
          Предпочтительный способ связи: Telegram.
        </p>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-lg">✉️</span>
            <div>
              <p className="text-text-sec text-xs mb-0.5">Email</p>
              <a
                href="mailto:partners@beautyhub.ru"
                className="text-text-main font-medium hover:text-primary transition-colors"
              >
                partners@beautyhub.ru
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg">💬</span>
            <div>
              <p className="text-text-sec text-xs mb-0.5">Telegram</p>
              <a
                href="https://t.me/beautyhub_partner"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-main font-medium hover:text-primary transition-colors"
              >
                @beautyhub_partner
              </a>
            </div>
          </div>
        </div>
        <p className="text-xs text-text-sec border-t border-border-subtle pt-4">
          Рассматриваем все обращения. Спам и нерелевантные предложения просим не присылать.
        </p>
      </section>
    </main>
  );
}

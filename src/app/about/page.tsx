import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "О платформе — BeautyHub",
  description:
    "BeautyHub — маркетплейс мастеров красоты. Узнайте, как мы помогаем клиентам находить специалистов, а мастерам — управлять записями и развивать бизнес.",
};

const STATS = [
  { value: "1 000+", label: "мастеров и студий" },
  { value: "50 000+", label: "бронирований" },
  { value: "20+", label: "городов" },
  { value: "4.9", label: "средний рейтинг" },
];

const VALUES = [
  {
    icon: "🎯",
    title: "Прозрачность",
    desc: "Реальные отзывы, честные цены и актуальное расписание без звонков и ожидания.",
  },
  {
    icon: "⚡",
    title: "Скорость",
    desc: "Запись за пару касаний. Без мессенджеров, без «напишите в директ».",
  },
  {
    icon: "🤝",
    title: "Партнёрство",
    desc: "Мы зарабатываем только тогда, когда зарабатывают мастера. Наш рост — общий.",
  },
  {
    icon: "🔒",
    title: "Надёжность",
    desc: "Данные клиентов и платежи защищены. Расписание всегда под рукой.",
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          О платформе
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main leading-tight tracking-tight">
          Красота — без лишних{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            сложностей
          </span>
        </h1>
        <p className="text-lg text-text-sec max-w-[600px] mx-auto leading-relaxed">
          BeautyHub — это маркетплейс, который соединяет клиентов с мастерами красоты.
          Мы решаем простую, но болезненную проблему: найти хорошего специалиста и
          записаться к нему — до сих пор та ещё задача.
        </p>
      </section>

      {/* Problem */}
      <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-4">
        <h2 className="text-2xl font-semibold text-text-main">Какую проблему мы решаем</h2>
        <div className="grid md:grid-cols-2 gap-6 text-text-sec text-sm leading-relaxed">
          <div className="space-y-2">
            <p className="font-medium text-text-main">Для клиентов</p>
            <p>
              Поиск мастера — это часами листать Instagram, писать в директ, ждать ответа,
              уточнять цену, узнавать свободные даты. Часть мастеров не отвечает вообще.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-text-main">Для мастеров</p>
            <p>
              Управление записями вручную — через мессенджеры, заметки и память — отнимает
              время, которое можно потратить на работу. Пропущенные записи, накладки,
              потерянные клиенты.
            </p>
          </div>
        </div>
        <p className="text-text-sec text-sm leading-relaxed pt-2 border-t border-border-subtle">
          BeautyHub закрывает оба конца: клиент видит реальное расписание и бронирует
          онлайн, мастер получает уведомление и ведёт всю базу в одном месте.
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div
            key={s.value}
            className="lux-card rounded-[20px] bg-bg-card p-6 text-center space-y-1"
          >
            <div className="text-3xl font-bold text-text-main">{s.value}</div>
            <div className="text-sm text-text-sec">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Values */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">Наши принципы</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4"
            >
              <div className="text-2xl shrink-0">{v.icon}</div>
              <div>
                <p className="font-semibold text-text-main mb-1">{v.title}</p>
                <p className="text-sm text-text-sec leading-relaxed">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-4">
        <h2 className="text-2xl font-semibold text-text-main">Присоединяйтесь</h2>
        <p className="text-text-sec text-sm">
          Вы клиент — найдите мастера рядом. Вы мастер — попробуйте бесплатно.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/catalog"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-6 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            Найти мастера
          </Link>
          <Link
            href="/become-master"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-bg-card px-6 text-sm font-semibold text-text-main hover:bg-bg-input transition-colors"
          >
            Стать мастером
          </Link>
        </div>
      </section>
    </main>
  );
}

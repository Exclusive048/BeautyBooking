import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Стать мастером — МастерРядом",
  description:
    "Зарегистрируйтесь как мастер на МастерРядом. Онлайн-запись, управление расписанием, клиентская Р±аза и продвижение в каталоге.",
};

const ADVANTAGES = [
  {
    icon: "📅",
    title: "Онлайн-запись без звонков",
    desc: "Клиенты бронируют сами — вы получаете уведомление и подтверждаете одним нажатием. Никаких переписок в директе.",
  },
  {
    icon: "🗓️",
    title: "Умное расписание",
    desc: "Настройте рабочие часы, перерывы, выходные и буфер между записями. Поддерживается цикличный режим 2/2 и 3/3.",
  },
  {
    icon: "📸",
    title: "Портфолио в ленте",
    desc: "Ваши работы появляются на главной странице МастерРядом. Клиент видит фото — нажимает «Записаться» — попадает к вам.",
  },
  {
    icon: "⭐",
    title: "Отзывы и рейтинг",
    desc: "После каждого визита клиент может оставить отзыв. Рейтинг влияет на позицию в каталоге.",
  },
  {
    icon: "🔔",
    title: "Уведомления в Telegram",
    desc: "Подключите бота — и новые записи, отмены и сообщения приходят прямо в мессенджер.",
  },
  {
    icon: "👥",
    title: "База клиентов",
    desc: "Все кто записывался к вам — в одном месте. История визитов, контакты, заметки.",
  },
];

const HOW_TO_START = [
  {
    step: "1",
    title: "Зарегистрируйтесь",
    desc: "Войдите через Telegram или VK. Выберите роль «Мастер» или «Студия».",
  },
  {
    step: "2",
    title: "Заполните профиль",
    desc: "Добавьте имя, описание, категории услуг, фото профиля и загрузите первые работы в портфолио.",
  },
  {
    step: "3",
    title: "Настройте прайс",
    desc: "Создайте услуги с названием, ценой и длительностью. Можно добавить несколько категорий.",
  },
  {
    step: "4",
    title: "Откройте расписание",
    desc: "Укажите рабочие часы. Как только опубликуете профиль — появитесь в каталоге и клиенты смогут записываться.",
  },
];

export default function BecomeMasterPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Для мастеров
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main leading-tight tracking-tight">
          Р’аС€ бизнес —{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            без лишней суеты
          </span>
        </h1>
        <p className="text-text-sec text-lg max-w-[540px] mx-auto">
          МастерРядом берёт на себя запись и напоминания. Р’С‹ занимаетесь тем, что умеете лучше всего.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-8 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            Зарегистрироваться бесплатно
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-border-subtle bg-bg-card px-6 text-sm font-semibold text-text-main hover:bg-bg-input transition-colors"
          >
            Смотреть тарифы
          </Link>
        </div>
        <p className="text-xs text-text-sec">Бесплатный тариф навсегда. Карта не нужна.</p>
      </section>

      {/* Advantages */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main text-center">Что вы получаете</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {ADVANTAGES.map((a) => (
            <div key={a.title} className="lux-card rounded-[20px] bg-bg-card p-6 space-y-3">
              <div className="text-2xl">{a.icon}</div>
              <p className="font-semibold text-text-main text-sm">{a.title}</p>
              <p className="text-xs text-text-sec leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How to start */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">Как начать</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {HOW_TO_START.map((s) => (
            <div key={s.step} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-magenta flex items-center justify-center text-white text-sm font-bold shrink-0">
                {s.step}
              </div>
              <div>
                <p className="font-semibold text-text-main text-sm">{s.title}</p>
                <p className="text-xs text-text-sec leading-relaxed mt-1">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-main">Тарифы</h2>
          <p className="text-text-sec text-sm max-w-[400px]">
            Базовые функции — бесплатно навсегда. PRO и Premium открывают карту,
            горячие слоты, аналитику и приоритет в каталоге.
          </p>
        </div>
        <Link
          href="/pricing"
          className="shrink-0 inline-flex h-10 items-center justify-center rounded-xl border border-border-subtle bg-bg-input px-6 text-sm font-semibold text-text-main hover:bg-bg-card transition-colors"
        >
          Сравнить тарифы →
        </Link>
      </section>

      {/* Studio section */}
      <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏢</span>
          <h2 className="text-xl font-semibold text-text-main">Работаете в студии?</h2>
        </div>
        <p className="text-text-sec text-sm leading-relaxed">
          МастерРядом поддерживает режим студии: несколько мастеров, общий календарь,
          разграничение ролей (владелец, администратор, мастер), финансовая отчётность
          по каждому специалисту. Мастера работают в своём кабинете, вы видите полную картину.
        </p>
        <Link
          href="/help/masters"
          className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
        >
          Подробнее в Р±азРµ знаний →
        </Link>
      </section>
    </main>
  );
}


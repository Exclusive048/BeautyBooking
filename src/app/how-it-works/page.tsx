import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Как это работает — BeautyHub",
  description:
    "Узнайте как устроен BeautyHub: роли в системе, онлайн-запись, расписание, горячие слоты и другие возможности платформы.",
};

const CLIENT_STEPS = [
  {
    step: "01",
    title: "Найдите мастера",
    desc: "Ищите по услуге, категории или локации. Смотрите портфолио, читайте отзывы, проверяйте рейтинг.",
  },
  {
    step: "02",
    title: "Выберите время",
    desc: "Видите актуальное расписание в реальном времени. Никаких звонков — просто выберите удобный слот.",
  },
  {
    step: "03",
    title: "Подтвердите запись",
    desc: "Укажите имя и номер телефона. Мастер подтверждает запись — вы получаете уведомление.",
  },
  {
    step: "04",
    title: "Приходите и оставьте отзыв",
    desc: "После визита оцените мастера. Ваш отзыв помогает другим клиентам с выбором.",
  },
];

const MASTER_STEPS = [
  {
    step: "01",
    title: "Создайте профиль",
    desc: "Заполните информацию о себе, добавьте услуги с ценами и длительностью, загрузите портфолио.",
  },
  {
    step: "02",
    title: "Настройте расписание",
    desc: "Укажите рабочие часы по дням недели, добавьте перерывы и выходные. Поддерживается цикличный режим 2/2.",
  },
  {
    step: "03",
    title: "Принимайте записи",
    desc: "Клиенты бронируют онлайн — вы получаете уведомление в Telegram или пуш. Подтверждайте одним нажатием.",
  },
  {
    step: "04",
    title: "Развивайтесь",
    desc: "Собирайте отзывы, управляйте базой клиентов, запускайте горячие слоты для заполнения окошек.",
  },
];

const KILLER_FEATURES = [
  {
    icon: "🔥",
    title: "Горячие слоты",
    desc: "Мастер публикует срочные свободные окошки со скидкой. Клиент видит их в отдельной ленте и может записаться за несколько часов до визита. Помогает заполнить расписание без звонков.",
    badge: "Premium",
  },
  {
    icon: "🏢",
    title: "Студии и команды",
    desc: "Владелец студии добавляет мастеров, распределяет услуги, видит общий календарь и финансовую сводку. Мастера могут запрашивать изменения в своём расписании — владелец одобряет.",
    badge: "Для студий",
  },
  {
    icon: "📸",
    title: "Лента вдохновения",
    desc: "Главная страница BeautyHub — это живой поток работ мастеров. Клиент видит красивое фото, нажимает «Записаться» — и сразу попадает в форму бронирования.",
    badge: "Для всех",
  },
  {
    icon: "🎭",
    title: "Модельные офферы",
    desc: "Мастер публикует объявление: нужна модель для практики или пополнения портфолио по сниженной цене. Модели откликаются, мастер выбирает.",
    badge: "Для мастеров",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Как это работает
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main leading-tight tracking-tight">
          Просто. Быстро.{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            Без лишнего.
          </span>
        </h1>
        <p className="text-text-sec text-lg max-w-[540px] mx-auto">
          В BeautyHub две роли — клиент и мастер. Вот как всё устроено для каждого.
        </p>
      </section>

      {/* Client flow */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👤</span>
          <h2 className="text-2xl font-semibold text-text-main">Для клиента</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {CLIENT_STEPS.map((s) => (
            <div key={s.step} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
              <div className="text-3xl font-black text-primary/20 leading-none shrink-0 select-none">
                {s.step}
              </div>
              <div>
                <p className="font-semibold text-text-main mb-1">{s.title}</p>
                <p className="text-sm text-text-sec leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-center">
          <Link
            href="/catalog"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-6 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            Найти мастера →
          </Link>
        </div>
      </section>

      {/* Master flow */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✂️</span>
          <h2 className="text-2xl font-semibold text-text-main">Для мастера</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {MASTER_STEPS.map((s) => (
            <div key={s.step} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
              <div className="text-3xl font-black text-primary/20 leading-none shrink-0 select-none">
                {s.step}
              </div>
              <div>
                <p className="font-semibold text-text-main mb-1">{s.title}</p>
                <p className="text-sm text-text-sec leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-center">
          <Link
            href="/become-master"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-6 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            Зарегистрироваться как мастер →
          </Link>
        </div>
      </section>

      {/* Killer features */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">Ключевые возможности</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {KILLER_FEATURES.map((f) => (
            <div key={f.title} className="lux-card rounded-[20px] bg-bg-card p-6 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-2xl">{f.icon}</span>
                <span className="rounded-full border border-border-subtle px-3 py-0.5 text-xs text-text-sec">
                  {f.badge}
                </span>
              </div>
              <p className="font-semibold text-text-main">{f.title}</p>
              <p className="text-sm text-text-sec leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Studio block */}
      <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏢</span>
          <h2 className="text-xl font-semibold text-text-main">У вас студия?</h2>
        </div>
        <p className="text-text-sec text-sm leading-relaxed">
          BeautyHub поддерживает полноценный режим студии: несколько мастеров, общий
          календарь, финансовая отчётность, роли (владелец, администратор, мастер).
          Мастера работают в своём кабинете, вы видите полную картину.
        </p>
        <Link
          href="/become-master"
          className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
        >
          Подробнее о студиях →
        </Link>
      </section>
    </main>
  );
}

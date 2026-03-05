import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Тарифы — МастерРядом",
  description:
    "Тарифные планы МастерРядом для мастеров и студий. Бесплатный тариф навсегда, PRO и Premium для роста.",
};

type Plan = {
  code: string;
  name: string;
  price: string;
  period: string;
  badge?: string;
  badgeColor?: string;
  desc: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
};

const MASTER_PLANS: Plan[] = [
  {
    code: "free",
    name: "FREE",
    price: "0 ₽",
    period: "навсегда",
    desc: "Базовые инструменты для старта. Без ограничений по времени.",
    features: [
      "Профиль в каталоге",
      "Онлайн-запись клиентов",
      "Все виды расписания (недельное, цикличное, шаблоны)",
      "Портфолио до 15 фотографий",
      "Прайс-лист услуг",
      "Отзывы и ответы на них",
      "Список клиентов (без истории визитов)",
      "Уведомления в приложении + PWA push",
      "Вход через Telegram / VK",
    ],
    cta: "Начать бесплатно",
    ctaHref: "/login",
  },
  {
    code: "pro",
    name: "PRO",
    price: "990 ₽",
    period: "в месяц",
    badge: "Популярный",
    badgeColor: "from-primary to-primary-magenta",
    desc: "Полный инструментарий для активного мастера.",
    features: [
      "Всё из FREE",
      "Отображение на карте",
      "Приоритет в каталоге",
      "Портфолио без ограничений",
      "Онлайн-оплата записей (вкл/выкл по услугам)",
      "Уведомления в Telegram и SMS",
      "История визитов клиентов",
      "Заметки о клиентах",
      "Финансовая касса (при подключении оплаты)",
    ],
    cta: "Попробовать PRO",
    ctaHref: "/login",
    highlight: true,
  },
  {
    code: "premium",
    name: "PREMIUM",
    price: "1 990 ₽",
    period: "в месяц",
    desc: "Максимальные возможности для роста и продвижения.",
    features: [
      "Всё из PRO",
      "Горячие слоты со скидкой",
      "Badge и выделение в каталоге",
      "Аналитика с графиками",
      "Импорт клиентской базы из YClients",
    ],
    cta: "Попробовать Premium",
    ctaHref: "/login",
  },
];

const STUDIO_PLANS: Plan[] = [
  {
    code: "studio_free",
    name: "FREE",
    price: "0 ₽",
    period: "навсегда",
    desc: "До 2 мастеров. Попробуйте без риска.",
    features: [
      "Профиль студии в каталоге",
      "До 2 мастеров",
      "Онлайн-запись",
      "Все виды расписания",
      "Портфолио студии до 15 фото + 10 фото/мастер",
      "Отзывы",
      "Список клиентов (без истории)",
      "Роли: владелец, администратор, мастер",
      "Уведомления в приложении + PWA push",
    ],
    cta: "Начать бесплатно",
    ctaHref: "/login",
  },
  {
    code: "studio_pro",
    name: "PRO",
    price: "2 490 ₽",
    period: "в месяц",
    badge: "Популярный",
    badgeColor: "from-primary to-primary-magenta",
    desc: "До 7 мастеров. Полный контроль над студией.",
    features: [
      "Всё из FREE",
      "До 7 мастеров",
      "Отображение на карте",
      "Приоритет в каталоге",
      "Портфолио без ограничений",
      "Общий календарь всех мастеров",
      "Финансовая отчётность по студии и мастерам",
      "Онлайн-оплата записей",
      "Уведомления в Telegram и SMS",
      "История визитов и заметки о клиентах",
    ],
    cta: "Попробовать PRO",
    ctaHref: "/login",
    highlight: true,
  },
  {
    code: "studio_premium",
    name: "PREMIUM",
    price: "4 990 ₽",
    period: "в месяц",
    desc: "Безлимит мастеров. Аналитика и максимум возможностей.",
    features: [
      "Всё из PRO",
      "Неограниченное количество мастеров",
      "Горячие слоты",
      "Badge и выделение в каталоге",
      "Аналитика с графиками",
      "Импорт клиентской базы из YClients",
    ],
    cta: "Попробовать Premium",
    ctaHref: "/login",
  },
];

function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`lux-card rounded-[24px] bg-bg-card p-7 flex flex-col gap-5 relative ${plan.highlight ? "ring-2 ring-primary/40" : ""}`}
    >
      {plan.badge && (
        <div className={`absolute -top-3 left-6 rounded-full bg-gradient-to-r ${plan.badgeColor} px-3 py-1 text-xs font-semibold text-white shadow-sm`}>
          {plan.badge}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-bold text-text-sec tracking-widest uppercase">{plan.name}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black text-text-main">{plan.price}</span>
          <span className="text-sm text-text-sec">{plan.period}</span>
        </div>
        <p className="text-sm text-text-sec">{plan.desc}</p>
      </div>

      <ul className="space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-text-sec">
            <span className="text-primary mt-0.5 shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={plan.ctaHref}
        className={`w-full inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-all ${
          plan.highlight
            ? "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-white shadow-card hover:brightness-105"
            : "border border-border-subtle bg-bg-input text-text-main hover:bg-bg-card"
        }`}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12 md:py-20 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Тарифы
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main tracking-tight">
          Прозрачные цены,{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            никаких сюрпризов
          </span>
        </h1>
        <p className="text-text-sec text-lg max-w-[480px] mx-auto">
          Бесплатный тариф навсегда. Переходите на PRO или Premium когда будете готовы.
        </p>
      </section>

      {/* Master plans */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">Для соло-мастеров</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {MASTER_PLANS.map((plan) => (
            <PricingCard key={plan.code} plan={plan} />
          ))}
        </div>
      </section>

      {/* Studio plans */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">Для студий</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {STUDIO_PLANS.map((plan) => (
            <PricingCard key={plan.code} plan={plan} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-5 max-w-[720px] mx-auto">
        <h2 className="text-xl font-semibold text-text-main">Вопросы о тарифах</h2>
        <div className="space-y-3">
          {[
            ["Нужна ли карта для бесплатного тарифа?", "Нет. Регистрация и использование бесплатного тарифа не требуют привязки карты."],
            ["Могу ли я поменять тариф в любой момент?", "Да. Переход на более высокий тариф — мгновенный. При понижении тариф действует до конца оплаченного периода."],
            ["Как работает онлайн-оплата записей?", "Оплата клиентами доступна с тарифа PRO. Используется ЮKassa — поддерживает карты и СБП. Вы можете включать оплату отдельно для каждой услуги."],
            ["Есть ли скидка при оплате на год?", "Готовим годовые тарифы со скидкой — следите за обновлениями в нашем Telegram-канале."],
          ].map(([q, a]) => (
            <details key={q} className="lux-card rounded-[16px] bg-bg-card group">
              <summary className="flex items-center justify-between cursor-pointer p-5 font-medium text-sm text-text-main list-none">
                {q}
                <span className="ml-4 shrink-0 text-text-sec group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}


import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { FeatureGrid } from "@/features/marketing/sections/feature-grid";
import { StepsSection } from "@/features/marketing/sections/steps-section";
import { PricingTeaser } from "@/features/marketing/sections/pricing-teaser";
import { CTABlock } from "@/features/marketing/sections/cta-block";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Стать мастером — МастерРядом",
  description:
    "Подключите кабинет на МастерРядом — без комиссий с услуг. CRM, расписание, аналитика и поток клиентов из каталога.",
  alternates: { canonical: "/become-master" },
};

const T = UI_TEXT.becomeMaster;

// /login is the unified entry point. Role onboarding happens after sign-in via
// resolveCabinetRedirect — there's no `?role=master` query param in this app,
// so don't invent one.
const REGISTER_URL = "/login";
const PRICING_URL = "/pricing";

export default function BecomeMasterPage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow={T.hero.eyebrow}
        title={
          <>
            Кабинет, который{" "}
            <em className="font-display font-normal italic text-primary">работает за вас</em>
          </>
        }
        description="Подключите расписание к МастерРядом и забудьте про переписки в Telegram. Клиенты записываются сами, напоминания работают, CRM ведёт историю. Без комиссий с услуг — только подписка за платформу."
        cta={{
          primary: { label: "Зарегистрироваться", href: REGISTER_URL },
          secondary: { label: "Посмотреть тарифы", href: PRICING_URL },
        }}
      />

      <TextWithImage
        eyebrow={T.pain.eyebrow}
        title={
          <>
            Расписание в скриншотах,{" "}
            <em className="font-display font-normal italic text-primary">клиенты в Telegram</em>
          </>
        }
        paragraphs={[
          "Половина рабочего времени уходит не на услуги, а на администрирование. Уточнить свободное окно. Принять отмену. Напомнить за день. Перенести на следующую неделю. Часть клиентов теряется потому что не дошли в переписке.",
          "Эта работа не оплачивается. Она съедает вечера, уничтожает планирование, создаёт постоянное чувство «надо ответить». А с каждым новым клиентом нагрузка растёт.",
          "МастерРядом перекладывает всю эту работу на платформу. Расписание ведёт себя само, напоминания приходят автоматически, отмены и переносы — в один тап. У вас остаётся только сама работа.",
        ]}
      />

      <FeatureGrid
        eyebrow={T.features.eyebrow}
        title="Полный кабинет, не CRM-калькулятор"
        description="Не «инструмент для записи». Полная инфраструктура работы с клиентами."
        features={[
          {
            iconName: "calendar-days",
            title: "Гибкое расписание",
            description:
              "Шаблоны рабочих дней, разовые переопределения, перерывы, выходные. Можно вести фиксированную сетку слотов или свободные окна — на ваш выбор.",
          },
          {
            iconName: "users",
            title: "CRM без бумаги",
            description:
              "История каждого клиента: визиты, заметки, теги, фотографии работ. Доступ только у вас. Платформа — обработчик данных, вы — оператор.",
          },
          {
            iconName: "wallet",
            title: "Без комиссий с услуг",
            description:
              "Платформа берёт месячную подписку — это всё. Каждый рубль от клиента приходит вам без посредников.",
          },
          {
            iconName: "bar-chart",
            title: "Аналитика что работает",
            description:
              "Какие услуги приносят больше, в какие часы загрузка плотнее, кто из клиентов возвращается, а кто пришёл и пропал. Не угадывайте — смотрите.",
          },
          {
            iconName: "bell-ring",
            title: "Уведомления без админа",
            description:
              "Клиенты не забывают приходить — приходит напоминание за 24 часа и за 2 часа. Вы не забываете подтверждать — приходит push когда есть новая бронь.",
          },
          {
            iconName: "image",
            title: "Портфолио и отзывы",
            description:
              "Ваши работы видят все клиенты в каталоге. Отзывы только от тех, кто реально записывался — никаких ботов и фейков.",
          },
        ]}
      />

      <StepsSection
        eyebrow={T.steps.eyebrow}
        title={
          <>
            От регистрации до публикации —{" "}
            <em className="font-display font-normal italic text-primary">за 30 минут</em>
          </>
        }
        description="Не нужны интеграции, не нужны разработчики. Регистрация и публикация — простой процесс."
        steps={[
          {
            title: "Зарегистрируйтесь",
            description:
              "Введите номер телефона и подтвердите код. Или войдите через Telegram — быстрее.",
          },
          {
            title: "Заполните профиль",
            description:
              "Адрес работы, услуги с ценами, портфолио, описание. Геокодер сам определит ваш город по адресу.",
          },
          {
            title: "Настройте расписание",
            description:
              "Выберите рабочие дни и часы. Можно использовать готовые шаблоны или построить свой.",
          },
          {
            title: "Публикуйте профиль",
            description:
              "После публикации профиль появляется в каталоге, и клиенты могут вас найти и записаться.",
          },
        ]}
      />

      <PricingTeaser
        eyebrow={T.pricing.eyebrow}
        title={
          <>
            Подписка вместо{" "}
            <em className="font-display font-normal italic text-primary">комиссий</em>
          </>
        }
        description="Выберите план под вашу нагрузку. Сменить можно в любой момент."
        plans={[
          {
            tier: "FREE",
            name: "Старт",
            price: "0 ₽",
            priceNote: "навсегда",
            description: "Чтобы попробовать платформу",
            features: [
              "Профиль в каталоге",
              "До 15 фото в портфолио",
              "Онлайн-запись и расписание",
              "Push-уведомления в браузере",
            ],
          },
          {
            // TODO: подставить реальную цену из BillingPlan когда админ настроит
            tier: "PRO",
            name: "Профи",
            price: "[Уточняется]",
            priceNote: "в месяц",
            description: "Для активной практики",
            highlighted: true,
            features: [
              "Всё из Старта",
              "Безлимит фото в портфолио",
              "CRM: заметки, теги, история визитов",
              "Аналитика загрузки и выручки",
              "Горящие слоты со скидкой",
              "Онлайн-оплата через ЮКассу",
              "Уведомления в Telegram и ВКонтакте",
            ],
          },
          {
            // TODO: подставить реальную цену из BillingPlan когда админ настроит
            tier: "PREMIUM",
            name: "Студия",
            price: "[Уточняется]",
            priceNote: "в месяц",
            description: "Для команды мастеров",
            features: [
              "Всё из Профи",
              "Студийный режим — несколько мастеров",
              "Общий календарь и роли",
              "Аналитика по каждому мастеру",
              "Финансовая отчётность",
              "Приоритетная поддержка",
            ],
          },
        ]}
        ctaHref={REGISTER_URL}
        ctaLabel="Начать бесплатно"
        fullPricingHref={PRICING_URL}
        fullPricingLabel="Все условия и сравнение"
      />

      <TextWithImage
        eyebrow={T.approach.eyebrow}
        title={
          <>
            Платформа, которую строят{" "}
            <em className="font-display font-normal italic text-primary">для долгого использования</em>
          </>
        }
        paragraphs={[
          "У МастерРядом нет венчурных денег и срочного «нужен exit за 18 месяцев». Это меняет всё. Мы не запускаем фичи в спешке, не ломаем рабочие процессы ради метрик роста, не повышаем подписку чтобы понравиться инвесторам.",
          "Каждое решение проверяется на тех, кто будет им пользоваться. Если что-то неудобно — мы это знаем первыми, потому что сами записываемся к мастерам через свою платформу.",
        ]}
        imagePosition="left"
      />

      <CTABlock
        title={
          <>
            Готовы{" "}
            <em className="font-display font-normal italic text-white">подключиться</em>?
          </>
        }
        description="Регистрация бесплатна. Базовый тариф работает навсегда без оплаты. Карта при регистрации не нужна."
        cta={{
          primary: { label: "Зарегистрироваться", href: REGISTER_URL },
          secondary: { label: "Посмотреть тарифы", href: PRICING_URL },
        }}
      />
    </MarketingLayout>
  );
}

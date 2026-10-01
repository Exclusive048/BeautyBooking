import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { FeatureGrid } from "@/features/marketing/sections/feature-grid";
import { StepsSection } from "@/features/marketing/sections/steps-section";
import {
  PricingTeaser,
  type PricingPlan,
} from "@/features/marketing/sections/pricing-teaser";
import { CTABlock } from "@/features/marketing/sections/cta-block";
import {
  getMarketingPricing,
  type MarketingPlan,
} from "@/lib/billing/marketing-pricing";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";

export const metadata: Metadata = {
  title: "Стать мастером",
  description:
    "Подключите кабинет на МастерРядом — без комиссий с услуг. История клиентов, расписание, аналитика и новые клиенты из каталога.",
  alternates: { canonical: "/become-master" },
};

const T = UI_TEXT.becomeMaster;

// /login is the unified entry point. Role onboarding happens after sign-in via
// resolveCabinetRedirect — there's no `?role=master` query param in this app,
// so don't invent one.
const REGISTER_URL = "/login";
const PRICING_URL = "/pricing";

const PRICING_PLACEHOLDER = UI_TEXT.pricing.periods.placeholder;

/**
 * Builds the teaser-shaped plan from a real BillingPlan (or a placeholder
 * stub when the admin hasn't configured the tier yet). Feature lists stay
 * curated here — the teaser shows a marketing-friendly subset, not the full
 * comparison table.
 */
function teaserPlanFromMarket(
  plan: MarketingPlan | null,
  curated: Omit<PricingPlan, "price" | "priceNote">,
): PricingPlan {
  // FREE — flat 0 ₽ навсегда regardless of admin config.
  if (curated.tier === "FREE") {
    return { ...curated, price: UI_FMT.priceLabel(0), priceNote: UI_TEXT.pricing.periods.free };
  }

  // Paid tier with no monthly price configured → graceful placeholder.
  const monthly = plan?.prices.find((p) => p.periodMonths === 1);
  if (!monthly) {
    return { ...curated, price: PRICING_PLACEHOLDER, priceNote: "в месяц" };
  }
  return { ...curated, price: UI_FMT.priceLabel(monthly.priceKopeks), priceNote: "в месяц" };
}

export default async function BecomeMasterPage() {
  const pricing = await getMarketingPricing();

  return (
    <MarketingLayout>
      <HeroSection
        eyebrow={T.hero.eyebrow}
        title={
          <>
            Кабинет, который{" "}
            <em className="font-display font-normal italic text-accent-text">работает за вас</em>
          </>
        }
        description="Подключите расписание к МастерРядом и забудьте про бесконечные переписки. Клиенты записываются сами, напоминания работают, история клиентов ведётся сама. Без комиссий с услуг — только подписка за платформу."
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
            <em className="font-display font-normal italic text-accent-text">клиенты в переписке</em>
          </>
        }
        paragraphs={[
          "Половина рабочего времени уходит не на услуги, а на администрирование. Уточнить свободное окошко. Принять отмену. Напомнить за день. Перенести на следующую неделю. Часть клиентов теряется потому что не дошли в переписке.",
          "Эта работа не оплачивается. Она съедает вечера, уничтожает планирование, создаёт постоянное чувство «надо ответить». А с каждым новым клиентом нагрузка растёт.",
          "МастерРядом перекладывает всю эту работу на платформу. Расписание ведёт себя само, напоминания приходят автоматически, отмены и переносы — в один тап. У вас остаётся только сама работа.",
        ]}
      />

      <FeatureGrid
        eyebrow={T.features.eyebrow}
        title="Полный кабинет, а не просто журнал записей"
        description="Не «инструмент для записи». Всё, что нужно для работы с клиентами."
        features={[
          {
            iconName: "calendar-days",
            title: "Гибкое расписание",
            description:
              "Шаблоны рабочих дней, особые дни, перерывы, выходные. Можно принимать строго по времени или в любое свободное окошко — на ваш выбор.",
          },
          {
            iconName: "users",
            title: "История клиентов без бумаги",
            description:
              "История каждого клиента: визиты, заметки, метки, фотографии работ. Доступ только у вас.",
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
              "Клиенты не забывают приходить — приходит напоминание за 24 часа и за 2 часа. Вы не забываете подтверждать — приходит уведомление на телефон, когда есть новая запись.",
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
            <em className="font-display font-normal italic text-accent-text">за 30 минут</em>
          </>
        }
        description="Не нужен ни программист, ни отдельная настройка. Зарегистрировались, заполнили профиль — и вы в каталоге."
        steps={[
          {
            title: "Зарегистрируйтесь",
            description:
              "Введите номер телефона и подтвердите код — займёт меньше минуты.",
          },
          {
            title: "Заполните профиль",
            description:
              "Адрес работы, услуги с ценами, портфолио, описание. Город определится по адресу сам.",
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
            <em className="font-display font-normal italic text-accent-text">комиссий</em>
          </>
        }
        description="Выберите план под вашу нагрузку. Сменить можно в любой момент."
        plans={[
          teaserPlanFromMarket(pricing.master.free, {
            tier: "FREE",
            name: "FREE",
            description: "Чтобы попробовать платформу",
            features: [
              "Профиль в каталоге",
              "До 15 фото в портфолио",
              "Онлайн-запись и расписание",
              "Уведомления на телефон",
            ],
          }),
          teaserPlanFromMarket(pricing.master.pro, {
            tier: "PRO",
            name: "PRO",
            description: "Для активной практики",
            highlighted: true,
            features: [
              "Всё из FREE",
              "Безлимит фото в портфолио",
              "Карточка клиента: заметки, метки, история визитов",
              "Аналитика загрузки и выручки",
              "Горящие окошки со скидкой",
              "Онлайн-оплата через ЮКассу",
              "Уведомления о записях: на телефон и на почту",
            ],
          }),
          teaserPlanFromMarket(pricing.master.premium, {
            tier: "PREMIUM",
            name: "PREMIUM",
            description: "С максимумом возможностей",
            features: [
              "Всё из PRO",
              "Расширенная аналитика",
              "Приоритет в каталоге",
              "Финансовая отчётность",
              "Приоритетная поддержка",
            ],
          }),
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
            <em className="font-display font-normal italic text-accent-text">для долгого использования</em>
          </>
        }
        paragraphs={[
          "У МастерРядом нет венчурных денег и срочного «надо продаться за 18 месяцев». Это меняет всё. Мы не выпускаем новое в спешке, не ломаем рабочие процессы ради красивых цифр, не повышаем подписку чтобы понравиться инвесторам.",
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

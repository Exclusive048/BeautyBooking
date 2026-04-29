import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { FeatureGrid } from "@/features/marketing/sections/feature-grid";
import { StepsSection } from "@/features/marketing/sections/steps-section";
import { CTABlock } from "@/features/marketing/sections/cta-block";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "О компании — МастерРядом",
  description:
    "Маркетплейс мастеров красоты — от записи до отзыва без звонков и хаоса в мессенджерах.",
  alternates: { canonical: "/about" },
};

const T = UI_TEXT.about;

export default function AboutPage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow={T.hero.eyebrow}
        title={
          <>
            Маркетплейс мастеров красоты —{" "}
            <em className="font-display font-normal italic text-primary">
              просто, прозрачно, рядом
            </em>
          </>
        }
        description="Мы строим платформу, где клиент находит мастера, видит свободное окно и записывается за минуту — без звонков, скриншотов и переписки в мессенджерах. А мастер получает удобную CRM, расписание и инструменты для роста."
        cta={{
          primary: { label: "Найти мастера", href: "/catalog" },
          secondary: { label: "Стать мастером", href: "/become-master" },
        }}
      />

      <TextWithImage
        eyebrow={T.story.eyebrow}
        title={
          <>
            Почему мы это{" "}
            <em className="font-display font-normal italic text-primary">делаем</em>
          </>
        }
        paragraphs={[
          "Индустрия красоты в России живёт в Telegram. Расписание — в скриншотах. Запись — переписка с администратором. Отмена — ловишь час свободного времени, чтобы написать «не получится». Половина мастеров теряют клиентов из-за пропущенных сообщений.",
          "Мы строим МастерРядом, чтобы было иначе. Каталог, где видно расписание в реальном времени. Запись в один тап. Напоминания. Понятная история. И никакой административной нагрузки на мастера — система всё делает сама.",
        ]}
      />

      <FeatureGrid
        eyebrow={T.values.eyebrow}
        title={
          <>
            Что для нас{" "}
            <em className="font-display font-normal italic text-primary">важно</em>
          </>
        }
        description="Принципы, по которым строим платформу — и не отступаем от них в спешке."
        features={[
          {
            iconName: "heart",
            title: "Уважение к клиенту",
            description:
              "Никаких тёмных паттернов, скрытых платежей, навязчивых уведомлений. Если что-то не нужно — это можно выключить.",
          },
          {
            iconName: "sparkles",
            title: "Качество интерфейса",
            description:
              "Каждый экран продуман: типографика, ритм, скорость загрузки. Красота индустрии — в деталях продукта.",
          },
          {
            iconName: "users",
            title: "Поддержка мастеров",
            description:
              "Мы не берём комиссию с услуг. Платформа — это подписка, а заработок мастера — целиком его. Так честнее.",
          },
          {
            iconName: "zap",
            title: "Скорость и стабильность",
            description:
              "Запись должна работать всегда. Расписание не ломается, уведомления приходят вовремя, страница открывается за секунду.",
          },
          {
            iconName: "shield",
            title: "Прозрачность",
            description:
              "Открытые цены, честные отзывы, правила без мелкого шрифта. Мы не прячем условия в трёхэтажных оффертах.",
          },
          {
            iconName: "globe",
            title: "Доступность",
            description:
              "Не только Москва. Платформа растёт там, где появляются мастера — мы не ограничиваем географию whitelist'ом.",
          },
        ]}
      />

      <StepsSection
        eyebrow={T.howWeWork.eyebrow}
        title={
          <>
            Как мы{" "}
            <em className="font-display font-normal italic text-primary">работаем</em>
          </>
        }
        description="Не венчурный спринт, а планомерное строительство платформы, которой можно пользоваться годами."
        steps={[
          {
            title: "Слушаем мастеров",
            description:
              "Каждое решение проверяется на тех, кто будет им пользоваться. Не делаем по интуиции — делаем по запросу индустрии.",
          },
          {
            title: "Тестируем на себе",
            description:
              "Команда сама записывается через платформу к реальным мастерам. Если что-то неудобно — мы это знаем первыми.",
          },
          {
            title: "Релизим осторожно",
            description:
              "Большие изменения сначала идут в beta. Лучше отложить запуск на неделю, чем сломать чьё-то расписание.",
          },
          {
            title: "Слушаем снова",
            description:
              "Каждая фича — итерация. Релиз — это начало улучшения, а не конец работы над функционалом.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.team.eyebrow}
        title="Команда"
        paragraphs={[
          "Мы небольшая команда без венчурных денег и пресс-релизов. Бэкенд, фронтенд, продуктовая аналитика, поддержка — всё пишут люди, которые сами годами записывались к мастерам красоты и понимают, что в этом было не так.",
          "Мы строим продукт долго и осознанно. Не для exit'а. Для того чтобы индустрия красоты в России наконец получила инструмент, которого заслуживает.",
        ]}
        imagePosition="left"
      />

      <CTABlock
        title={
          <>
            Попробуйте — это{" "}
            <em className="font-display font-normal italic text-white">бесплатно</em>
          </>
        }
        description="Регистрация занимает 30 секунд. Никакой карты не нужно — ни клиенту, ни мастеру."
        cta={{
          primary: { label: "Начать", href: "/login" },
          secondary: { label: "Узнать о тарифах", href: "/pricing" },
        }}
      />
    </MarketingLayout>
  );
}

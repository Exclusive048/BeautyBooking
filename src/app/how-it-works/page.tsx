import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { FeatureGrid } from "@/features/marketing/sections/feature-grid";
import { CTABlock } from "@/features/marketing/sections/cta-block";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Как работает",
  description:
    "Маркетплейс для записи к мастерам красоты — без звонков и хаоса в мессенджерах. Каталог в реальном времени, кабинет для мастера, общая система уведомлений.",
  alternates: { canonical: "/how-it-works" },
};

const T = UI_TEXT.howItWorks;

export default function HowItWorksPage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow={T.hero.eyebrow}
        title={
          <>
            Маркетплейс для красоты —{" "}
            <em className="font-display font-normal italic text-accent-text">без хаоса</em>
          </>
        }
        description="Каталог для клиента, кабинет для мастера, общая система уведомлений. Что делает клиент, мастер видит сразу — и наоборот."
        cta={{
          primary: { label: "Найти мастера", href: "/catalog" },
          secondary: { label: "Стать мастером", href: "/become-master" },
        }}
      />

      <TextWithImage
        eyebrow={T.client.eyebrow}
        title={
          <>
            Записаться к мастеру за{" "}
            <em className="font-display font-normal italic text-accent-text">минуту</em>
          </>
        }
        paragraphs={[
          "Открываете каталог, отбираете по городу, услуге, цене или ближайшему свободному окошку. Никаких звонков администратору — расписание видно в реальном времени.",
          "Выбираете мастера, смотрите портфолио, отзывы, актуальные цены. Записываетесь в одно касание. Подтверждение придёт на телефон или на почту — как удобнее.",
          "За 24 часа и за 2 часа до записи — напоминание. Если планы меняются — отменяете в одно касание, мастеру приходит уведомление, его расписание обновляется.",
        ]}
      />

      <FeatureGrid
        eyebrow={T.clientFeatures.eyebrow}
        title="Возможности для клиентов"
        features={[
          {
            iconName: "search",
            title: "Каталог в реальном времени",
            description:
              "Расписание мастера всегда актуально. Никаких устаревших окошек и «ой, я уже не работаю в этот день».",
          },
          {
            iconName: "clock",
            title: "Поиск по свободному времени",
            description:
              "Фильтр «утро / день / вечер» плюс дата. Показываем только тех, кто свободен и записывает.",
          },
          {
            iconName: "flame",
            title: "Горящие окошки",
            description:
              "Мастера отдают окошки со скидкой в последний момент. Подпишитесь на любимых — не пропустите.",
          },
          {
            iconName: "credit-card",
            title: "Безопасные платежи",
            description:
              "Через ЮКассу. Можно оплатить онлайн или на месте у мастера — как вам удобнее.",
          },
          {
            iconName: "star",
            title: "Прозрачные отзывы",
            description:
              "Рейтинги и комментарии только от тех, кто реально записывался. Никаких покупных или ботов.",
          },
          {
            iconName: "bell",
            title: "Уведомления, как удобно",
            description:
              "На телефон или на почту. Выбираете, как удобнее, — мы не лезем туда, куда не просили.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.master.eyebrow}
        title={
          <>
            Кабинет, который{" "}
            <em className="font-display font-normal italic text-accent-text">думает за вас</em>
          </>
        }
        paragraphs={[
          "Расписание ведёте сами или берёте готовые шаблоны (понедельник–пятница 10–19, любые перерывы и выходные). Отдельные дни настраиваются как особые — без переписывания всей недели.",
          "Записи приходят сразу — уведомлением на телефон и письмом на почту. Если работаете сами — включите автоподтверждение. Если в студии — заявка идёт через администратора студии.",
          "Карточка клиента хранит всю историю: сколько раз был, на какие услуги ходил, что писал в комментариях. Можно вести заметки, метки, фотографии работ для себя.",
          "Аналитика рассказывает что приносит деньги, а что нет. Какие услуги популярны, в какие часы загрузка плотнее, кто из клиентов возвращается, а кто пришёл и пропал.",
        ]}
        imagePosition="left"
      />

      <FeatureGrid
        eyebrow={T.masterFeatures.eyebrow}
        title="Возможности для мастеров"
        features={[
          {
            iconName: "calendar-days",
            title: "Гибкое расписание",
            description:
              "Шаблоны рабочих дней, особые дни, перерывы, выходные. Без переписывания всей недели на каждое изменение.",
          },
          {
            iconName: "users",
            title: "Карточки клиентов",
            description:
              "Заметки, метки, история записей, фото работ — всё в одном месте. Доступ только у вас.",
          },
          {
            iconName: "wallet",
            title: "Подписка вместо комиссии",
            description:
              "Мы не берём процент с услуг. Только месячная подписка за платформу — ваш заработок остаётся вашим.",
          },
          {
            iconName: "bar-chart",
            title: "Аналитика",
            description:
              "Доход по услугам, кто возвращается, загрузка по часам. Понятно что работает, а что нет.",
          },
          {
            iconName: "bell-ring",
            title: "Уведомления и напоминания",
            description:
              "Клиенты не забывают приходить. Вы не забываете подтверждать записи. Все на связи без администратора.",
          },
          {
            iconName: "image",
            title: "Портфолио и отзывы",
            description:
              "Ваши работы видят все клиенты. Отзывы — только от тех, кто действительно записывался.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.connection.eyebrow}
        title={
          <>
            Одна платформа —{" "}
            <em className="font-display font-normal italic text-accent-text">две стороны</em>
          </>
        }
        paragraphs={[
          "Когда клиент записывается, мастер моментально получает уведомление. Когда мастер подтверждает запись, клиент сразу это видит. Когда мастер открывает новое горящее окошко — подписанные клиенты получают уведомление.",
          "Это не две отдельные программы, а одно общее пространство: что делает один, сразу видит другой. Никто никого не теряет.",
        ]}
      />

      <CTABlock
        title={
          <>
            Готовы{" "}
            <em className="font-display font-normal italic text-white">попробовать</em>?
          </>
        }
        description="Регистрация бесплатна. Никаких звонков, никаких карт — пока не запишетесь."
        cta={{
          primary: { label: "Найти мастера", href: "/catalog" },
          secondary: { label: "Стать мастером", href: "/become-master" },
        }}
      />
    </MarketingLayout>
  );
}

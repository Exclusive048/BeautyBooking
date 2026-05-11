import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { FeatureGrid } from "@/features/marketing/sections/feature-grid";
import { CTABlock } from "@/features/marketing/sections/cta-block";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Как работает — МастерРядом",
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
            <em className="font-display font-normal italic text-primary">без хаоса</em>
          </>
        }
        description="Каталог для клиента, кабинет для мастера, общая система уведомлений. Все действия с одной стороны моментально отражаются на другой."
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
            <em className="font-display font-normal italic text-primary">минуту</em>
          </>
        }
        paragraphs={[
          "Открываешь каталог, фильтруешь по городу, услуге, цене или ближайшему свободному окну. Никаких звонков администратору — расписание видно в реальном времени.",
          "Выбираешь мастера, смотришь портфолио, отзывы, действующие цены. Записываешься в один тап. Получаешь подтверждение в Telegram, push или email — что удобнее.",
          "За 24 часа и за 2 часа до записи — напоминание. Если планы меняются — отменяешь в одно действие, мастеру приходит уведомление, его расписание обновляется.",
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
              "Фильтр «утро / день / вечер» плюс дата. Находим только тех, кто свободен и принимает.",
          },
          {
            iconName: "flame",
            title: "Горящие окошки",
            description:
              "Мастера публикуют скидочные окна в последний момент. Подпишись на любимых — не пропустишь.",
          },
          {
            iconName: "credit-card",
            title: "Безопасные платежи",
            description:
              "Через ЮКассу. Можно оплатить онлайн или на месте у мастера — выбираешь сам.",
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
              "Telegram, push в браузер или email. Выбираешь любимый канал — мы не лезем туда, куда не просили.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.master.eyebrow}
        title={
          <>
            Кабинет, который{" "}
            <em className="font-display font-normal italic text-primary">думает за вас</em>
          </>
        }
        paragraphs={[
          "Расписание ведёшь сам или используешь готовые шаблоны (понедельник-пятница 10-19, любые перерывы и выходные). Можно делать переопределения на конкретные дни без переписывания всей сетки.",
          "Брони приходят сразу с уведомлением в Telegram. Если работаешь сам — настрой автоподтверждение. Если работаешь в студии — заявка идёт через администратора студии.",
          "CRM показывает историю каждого клиента: сколько раз был, на какие услуги ходил, что писал в комментариях. Можно вести заметки, теги, фотографии работ для себя.",
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
              "Шаблоны рабочих дней, разовые переопределения, перерывы, выходные. Без переписывания всей сетки на каждое изменение.",
          },
          {
            iconName: "users",
            title: "CRM по клиентам",
            description:
              "Заметки, теги, история бронирований, фото работ — всё в одном месте. Доступ только у тебя.",
          },
          {
            iconName: "wallet",
            title: "Подписка вместо комиссии",
            description:
              "Мы не берём процент с услуг. Только месячная подписка за платформу — твой заработок целиком твой.",
          },
          {
            iconName: "bar-chart",
            title: "Аналитика",
            description:
              "Выручка по услугам, рекуррентные клиенты, загрузка по часам. Понятно что работает, а что нет.",
          },
          {
            iconName: "bell-ring",
            title: "Уведомления и напоминания",
            description:
              "Клиенты не забывают приходить. Ты не забываешь подтверждать брони. Все на связи без админа.",
          },
          {
            iconName: "image",
            title: "Портфолио и отзывы",
            description:
              "Твои работы видят все клиенты. Отзывы — только от тех, кто действительно записывался.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.connection.eyebrow}
        title={
          <>
            Одна платформа —{" "}
            <em className="font-display font-normal italic text-primary">две стороны</em>
          </>
        }
        paragraphs={[
          "Когда клиент записывается, мастер моментально получает уведомление. Когда мастер подтверждает бронь, клиент видит статус. Когда мастер открывает новое горящее окошко — подписанные клиенты получают push.",
          "Это не два независимых интерфейса, а единая система: каждое действие с одной стороны мгновенно отражается на другой. Никто никого не теряет.",
        ]}
      />

      <CTABlock
        title={
          <>
            Готов{" "}
            <em className="font-display font-normal italic text-white">попробовать</em>?
          </>
        }
        description="Регистрация бесплатна. Никаких звонков, никаких карт — пока не запишешься."
        cta={{
          primary: { label: "Найти мастера", href: "/catalog" },
          secondary: { label: "Стать мастером", href: "/become-master" },
        }}
      />
    </MarketingLayout>
  );
}

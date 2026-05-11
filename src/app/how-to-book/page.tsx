import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { StepsSection } from "@/features/marketing/sections/steps-section";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { CTABlock } from "@/features/marketing/sections/cta-block";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Как записаться — МастерРядом",
  description:
    "Запись к мастеру красоты за 5 простых шагов. Без звонков, без переписки в мессенджерах — открыл, выбрал, записался.",
  alternates: { canonical: "/how-to-book" },
};

const T = UI_TEXT.howToBook;

export default function HowToBookPage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow={T.hero.eyebrow}
        title={
          <>
            Запись к мастеру за{" "}
            <em className="font-display font-normal italic text-primary">5 простых шагов</em>
          </>
        }
        description="Никаких звонков, никаких переписок в мессенджерах. Открыл, выбрал, записался — за минуту."
        cta={{
          primary: { label: "Перейти в каталог", href: "/catalog" },
        }}
      />

      <StepsSection
        eyebrow={T.steps.eyebrow}
        title={
          <>
            Пять шагов до{" "}
            <em className="font-display font-normal italic text-primary">записи</em>
          </>
        }
        description="Весь процесс — от поиска до похода к мастеру. Без скрытых подвохов."
        steps={[
          {
            title: "Найди мастера",
            description:
              "Открой каталог и фильтруй: по городу, услуге, цене или ближайшему свободному окну. Карта показывает кто рядом, рейтинг — кто проверен.",
          },
          {
            title: "Посмотри портфолио и цены",
            description:
              "На странице мастера — реальные работы, отзывы клиентов, текущие цены. Никаких «уточняйте по телефону» — всё видно сразу.",
          },
          {
            title: "Выбери время и запишись",
            description:
              "Расписание показывает свободные окошки в реальном времени. Выбираешь день и время, нажимаешь «Записаться» — всё.",
          },
          {
            title: "Дождись подтверждения",
            description:
              "Мастер увидит заявку и подтвердит — обычно за пару минут. Тебе придёт уведомление в Telegram, push или email — что выбрал.",
          },
          {
            title: "Приди вовремя",
            description:
              "За 24 часа и за 2 часа до записи — напоминание. Адрес, время, имя мастера — всё в кабинете. Опаздываешь — отмени или перенеси в один тап.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.flexibility.eyebrow}
        title={
          <>
            Если планы{" "}
            <em className="font-display font-normal italic text-primary">меняются</em>
          </>
        }
        paragraphs={[
          "Открой бронь в личном кабинете → «Отменить» или «Перенести». Один тап. Мастер моментально получит уведомление, его расписание обновится автоматически.",
          "Если до записи меньше 24 часов — мастер всё равно получит уведомление, но может попросить компенсацию по своим правилам. У каждого мастера правила свои — они указаны на его странице.",
        ]}
      />

      <CTABlock
        title={
          <>
            Готов{" "}
            <em className="font-display font-normal italic text-white">записаться</em>?
          </>
        }
        description="В каталоге уже сотни мастеров. Найди своего за минуту."
        cta={{
          primary: { label: "Открыть каталог", href: "/catalog" },
        }}
      />
    </MarketingLayout>
  );
}

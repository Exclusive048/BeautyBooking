import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { StepsSection } from "@/features/marketing/sections/steps-section";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { CTABlock } from "@/features/marketing/sections/cta-block";
import * as UI_TEXT from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Как записаться",
  description:
    "Запись к мастеру красоты за 5 простых шагов. Без звонков, без переписки в мессенджерах — открыли, выбрали, записались.",
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
            <em className="font-display font-normal italic text-accent-text">5 простых шагов</em>
          </>
        }
        description="Никаких звонков, никаких переписок в мессенджерах. Открыли, выбрали, записались — за минуту."
        cta={{
          primary: { label: "Перейти в каталог", href: "/catalog" },
        }}
      />

      <StepsSection
        eyebrow={T.steps.eyebrow}
        title={
          <>
            Пять шагов до{" "}
            <em className="font-display font-normal italic text-accent-text">записи</em>
          </>
        }
        description="Весь процесс — от поиска до похода к мастеру. Без скрытых подвохов."
        steps={[
          {
            title: "Найдите мастера",
            description:
              "Откройте каталог и отберите по городу, услуге, цене или ближайшему свободному окошку. Карта показывает кто рядом, рейтинг — кто проверен.",
          },
          {
            title: "Посмотрите портфолио и цены",
            description:
              "На странице мастера — реальные работы, отзывы клиентов, текущие цены. Никаких «уточняйте по телефону» — всё видно сразу.",
          },
          {
            title: "Выберите время и запишитесь",
            description:
              "Расписание показывает свободные окошки в реальном времени. Выбираете день и время, нажимаете «Записаться» — всё.",
          },
          {
            title: "Дождитесь подтверждения",
            description:
              "Мастер увидит заявку и подтвердит — обычно за пару минут. Уведомление придёт на телефон или на почту — как вы выбрали.",
          },
          {
            title: "Приходите вовремя",
            description:
              "За 24 часа и за 2 часа до записи — напоминание. Адрес, время, имя мастера — всё в кабинете. Опаздываете — отмените или перенесите в одно касание.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.flexibility.eyebrow}
        title={
          <>
            Если планы{" "}
            <em className="font-display font-normal italic text-accent-text">меняются</em>
          </>
        }
        paragraphs={[
          "Откройте запись в личном кабинете и нажмите «Отменить» или «Перенести». Одно касание. Мастер моментально получит уведомление, его расписание обновится автоматически.",
          "Если до записи меньше 24 часов — мастер всё равно получит уведомление, но может попросить компенсацию по своим правилам. У каждого мастера правила свои — они указаны на его странице.",
        ]}
      />

      <CTABlock
        title={
          <>
            Готовы{" "}
            <em className="font-display font-normal italic text-white">записаться</em>?
          </>
        }
        description="В каталоге уже сотни мастеров. Найдите своего за минуту."
        cta={{
          primary: { label: "Открыть каталог", href: "/catalog" },
        }}
      />
    </MarketingLayout>
  );
}

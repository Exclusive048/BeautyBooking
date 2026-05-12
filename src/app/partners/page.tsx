import type { Metadata } from "next";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { FeatureGrid } from "@/features/marketing/sections/feature-grid";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { PartnershipForm } from "@/features/partners/components/partnership-form";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Сотрудничество — МастерРядом",
  description:
    "Школы, бренды, медиа, бьюти-сообщества и технологические партнёры — расскажите о вашем предложении.",
  alternates: { canonical: "/partners" },
};

const T = UI_TEXT.partners;

export default function PartnersPage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow={T.hero.eyebrow}
        title={
          <>
            Готовы{" "}
            <em className="font-display font-normal italic text-primary">обсудить</em>
          </>
        }
        description="Если у вас есть предложение по сотрудничеству — расскажите о нём. Мы откроем диалог в течение 3 рабочих дней."
      />

      <FeatureGrid
        eyebrow={T.formats.eyebrow}
        title={T.formats.title}
        description={T.formats.description}
        features={[
          {
            iconName: "graduation-cap",
            title: "Школы курсов мастеров",
            description:
              "Договоримся о специальных условиях для выпускников при регистрации, поможем с переходом из учебной практики в самостоятельную работу.",
          },
          {
            iconName: "package",
            title: "Бренды профессиональной косметики",
            description:
              "Возможны интеграции с каталогом материалов, специальные предложения для мастеров платформы, совместные мероприятия.",
          },
          {
            iconName: "megaphone",
            title: "Медиа и блогеры",
            description:
              "Готовы участвовать в обзорах, интервью, тематических материалах об индустрии красоты.",
          },
          {
            iconName: "users-round",
            title: "Бьюти-сообщества",
            description:
              "Профессиональные ассоциации, кооперативы мастеров — обсудим коллективные условия и совместные инициативы.",
          },
          {
            iconName: "code",
            title: "Технологические партнёры",
            description:
              "Образовательные платформы, CRM-системы для мастеров, провайдеры услуг — рассмотрим интеграции.",
          },
          {
            iconName: "handshake",
            title: "Другое",
            description:
              "Если ваше предложение не вписывается ни в одну категорию выше — это не значит что не подходит. Опишите в форме, разберёмся.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.approach.eyebrow}
        title={
          <>
            Что для нас{" "}
            <em className="font-display font-normal italic text-primary">важно</em>
          </>
        }
        paragraphs={[
          "Уважение к мастерам. Любое сотрудничество должно работать на их пользу — не быть способом выжать из платформы клиентов или внимание.",
          "Прозрачность условий. Мы предпочитаем простые понятные договорённости без мелкого шрифта. Если предложение требует двадцати страниц юридических уточнений — это не наш формат.",
          "Релевантность индустрии. Платформа про красоту, поэтому коллаборации с финтех-стартапами или строительными материалами — мимо. С учебными платформами, брендами материалов, бьюти-сообществами — да.",
          "Готовность к диалогу. Мы не подписываем коробочные договоры — обсуждаем условия, ищем взаимный интерес. Если ваше предложение не подходит — мы скажем прямо.",
        ]}
      />

      <section className="mx-auto max-w-3xl px-4 py-12 lg:py-16">
        <div className="mb-8">
          <h2 className="mb-3 font-display text-2xl text-text-main lg:text-3xl">
            {T.form.title}
          </h2>
          <p className="leading-relaxed text-text-sec">{T.form.subtitle}</p>
        </div>
        <PartnershipForm />
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <p className="mb-3 text-sm text-text-sec">{T.alternativeContact.description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <a
            href={T.alternativeContact.emailHref}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {T.alternativeContact.email}
          </a>

        </div>
      </section>
    </MarketingLayout>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FAQItem } from "@/features/faq/components/faq-item";
import { FAQ_DATA } from "@/features/faq/content/faq-content";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Часто спрашивают — МастерРядом",
  description:
    "Ответы на популярные вопросы о МастерРядом: регистрация, отмена записи, тарифы для мастеров, работа в студии, горящие окошки.",
  alternates: { canonical: "/faq" },
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_DATA.flatMap((cat) =>
    cat.questions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  ),
};

const T = UI_TEXT.faq;

export default function FaqPage() {
  return (
    <main className="bg-bg-page">
      {/* JSON-LD FAQPage schema for Rich Snippets in Google/Yandex search */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      {/* Hero — utilitarian, much smaller than /about or /how-it-works */}
      <section className="mx-auto max-w-3xl px-4 pb-8 pt-12 lg:pt-16">
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
          {T.hero.eyebrow}
        </p>
        <h1 className="font-display text-3xl text-text-main lg:text-4xl">
          Часто{" "}
          <em className="font-display font-normal italic text-primary">спрашивают</em>
        </h1>
        <p className="mt-3 leading-relaxed text-text-sec">
          {T.hero.descriptionPrefix}{" "}
          <Link href="/support" className="text-primary underline-offset-2 hover:underline">
            {T.hero.descriptionLink}
          </Link>
          .
        </p>
      </section>

      {/* Categories */}
      <div className="mx-auto max-w-3xl space-y-14 px-4 pb-16">
        {FAQ_DATA.map((category) => (
          <section key={category.id} aria-labelledby={`faq-cat-${category.id}`}>
            <h2
              id={`faq-cat-${category.id}`}
              className="mb-5 scroll-mt-20 font-display text-2xl text-text-main"
            >
              {category.title}
            </h2>
            <div className="space-y-3">
              {category.questions.map((item) => (
                <FAQItem
                  key={item.id}
                  id={item.id}
                  question={item.question}
                  answer={item.answer}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Final CTA — calm, no brand-gradient (utilitarian page) */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <h2 className="mb-3 font-display text-2xl text-text-main">{T.cta.title}</h2>
        <p className="mb-6 leading-relaxed text-text-sec">{T.cta.description}</p>
        <Button asChild variant="primary">
          <Link href="/support">{T.cta.supportButton}</Link>
        </Button>
      </section>
    </main>
  );
}

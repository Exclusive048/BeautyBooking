import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { FAQItem } from "@/features/faq/components/faq-item";
import { HelpTabsClient } from "@/features/help/components/help-tabs-client";
import {
  type HelpTab,
  helpDataFor,
} from "@/features/help/content/help-content";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Помощь — МастерРядом",
  description:
    "База знаний для мастеров и студий — как настроить профиль, расписание, работу с клиентами.",
  alternates: { canonical: "/help" },
};

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

const T = UI_TEXT.help;

function parseTab(value: string | undefined): HelpTab {
  return value === "studio" ? "studio" : "master";
}

export default async function HelpPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const activeTab = parseTab(tab);
  const data = helpDataFor(activeTab);

  return (
    <div className="bg-bg-page">
      {/* Inline hero — same atmosphere as /faq, /support, /careers. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/8 blur-3xl dark:bg-primary/12"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary-magenta/8 blur-3xl dark:bg-primary-magenta/12"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-12 text-center lg:py-16">
          <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {T.hero.eyebrow}
          </p>
          <h1 className="mb-4 font-display text-3xl leading-[1.1] text-text-main lg:text-4xl">
            {T.hero.title}
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-text-sec">
            {T.hero.description}
          </p>

          <div className="flex justify-center">
            <Suspense fallback={null}>
              <HelpTabsClient
                active={activeTab}
                items={[
                  { id: "master", label: T.tabs.master },
                  { id: "studio", label: T.tabs.studio },
                ]}
              />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Categories — `key={activeTab}` forces a fresh subtree on tab switch
          so <FAQItem> open/close state doesn't leak between decks. */}
      <div key={activeTab} className="mx-auto max-w-3xl px-4 pb-12">
        {data.map((category) => (
          <section
            key={category.id}
            id={`help-cat-${activeTab}-${category.id}`}
            aria-labelledby={`help-cat-title-${activeTab}-${category.id}`}
            className="mb-14 scroll-mt-20 last:mb-0"
          >
            <h2
              id={`help-cat-title-${activeTab}-${category.id}`}
              className="mb-5 font-display text-2xl text-text-main"
            >
              {category.title}
            </h2>
            <div className="space-y-3">
              {category.questions.map((q) => (
                <FAQItem
                  key={q.id}
                  id={`${activeTab}-${q.id}`}
                  question={q.question}
                  answer={q.answer}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Final CTA — calm, no brand-gradient (utility page). */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <h2 className="mb-3 font-display text-2xl text-text-main">{T.cta.title}</h2>
        <p className="mb-6 leading-relaxed text-text-sec">{T.cta.description}</p>
        <Button asChild variant="primary">
          <Link href="/support">{T.cta.button}</Link>
        </Button>
      </section>
    </div>
  );
}

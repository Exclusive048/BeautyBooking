import type { Metadata } from "next";
import Link from "next/link";
import { Flame } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";
import { FAQAccordion } from "@/components/ui/faq-accordion";

export const metadata: Metadata = {
  title: UI_TEXT.pages.howToBook.title,
  description: UI_TEXT.pages.howToBook.description,
  alternates: { canonical: "/how-to-book" },
};

const STEPS = UI_TEXT.pages.howToBook.steps;
const HOT_SLOTS_DESC = UI_TEXT.pages.howToBook.hotSlotsDescription;
const FAQ_GROUPS = [
  {
    title: "",
    items: UI_TEXT.pages.howToBook.faqItems.map(([q, a]) => ({ q, a })),
  },
];

export default function HowToBookPage() {
  return (
    <main className="mx-auto max-w-[860px] px-4 py-12 md:py-20 space-y-16">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.howToBook.navLabel}>

        {/* Hero */}
        <section className="space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
            {UI_TEXT.pages.howToBook.heroBadge}
          </div>
          <h1 className="text-4xl font-bold text-text-main tracking-tight">
            {UI_TEXT.pages.howToBook.heroTitle}
          </h1>
          <p className="text-text-sec text-lg">
            {UI_TEXT.pages.howToBook.heroSubtitle}
          </p>
        </section>

        {/* Steps */}
        <section className="space-y-4">
          {STEPS.map((s) => (
            <div key={s.num} className="lux-card rounded-[20px] bg-bg-card p-6 md:p-7 flex gap-5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-magenta flex items-center justify-center text-white text-sm font-bold shrink-0">
                {s.num}
              </div>
              <div className="space-y-2 flex-1">
                <p className="font-semibold text-text-main">{s.title}</p>
                {s.body.map((b, i) => (
                  <p key={i} className="text-sm text-text-sec leading-relaxed">{b}</p>
                ))}
                {s.tip && (
                  <div className="mt-3 rounded-xl bg-bg-input border border-border-subtle px-4 py-2.5 text-xs text-text-sec">
                    {s.tip}
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* Hot slots */}
        <section className="lux-card rounded-[24px] bg-bg-card p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Flame className="h-6 w-6 text-orange-500 shrink-0" aria-hidden />
            <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.howToBook.hotSlotsTitle}</h2>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs text-orange-600 font-medium">
              {UI_TEXT.pages.howToBook.hotSlotsBadge}
            </span>
          </div>
          {HOT_SLOTS_DESC.map((line, i) => (
            <p key={i} className="text-sm text-text-sec leading-relaxed">
              {line}
            </p>
          ))}
          <Link
            href="/catalog?hot=true"
            className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
          >
            {UI_TEXT.pages.howToBook.hotSlotsCta}
          </Link>
        </section>

        {/* FAQ quick */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.howToBook.faqTitle}</h2>
          <FAQAccordion groups={FAQ_GROUPS} />
          <div className="text-center pt-2">
            <Link href="/faq" className="text-sm text-primary hover:underline">
              {UI_TEXT.pages.howToBook.faqCta}
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/catalog"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-8 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            {UI_TEXT.pages.howToBook.ctaFindMaster}
          </Link>
        </div>

      </InfoPageLayout>
    </main>
  );
}

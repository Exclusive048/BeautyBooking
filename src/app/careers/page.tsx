import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Карьера",
  description: "Информация о будущих вакансиях в МастерРядом.",
  alternates: { canonical: "/careers" },
  // SEO-01: вакансий пока нет — тонкий контент не индексируется.
  robots: { index: false, follow: true },
};

const T = UI_TEXT.careers;

export default function CareersPage() {
  return (
    <div className="min-h-[calc(100vh-200px)] bg-bg-page">
      {/* Single-section utility page — same atmosphere as /faq hero. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-decor-primary blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-decor-magenta blur-3xl"
        />

        <div className="relative mx-auto max-w-2xl px-4 py-16 text-center lg:py-24">
          <p className="mb-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent-text">
            {T.eyebrow}
          </p>
          <h1 className="mb-6 font-display text-3xl leading-[1.1] text-text-main lg:text-4xl">
            {T.title}
          </h1>
          <div className="mb-8 space-y-4 leading-relaxed text-text-sec">
            <p>{T.paragraph1}</p>
            <p>{T.paragraph2}</p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/">{T.backHome}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

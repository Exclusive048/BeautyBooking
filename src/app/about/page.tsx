import type { Metadata } from "next";
import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.about.title,
  description: UI_TEXT.pages.about.description,
};

const STATS = UI_TEXT.pages.about.stats;
const VALUES = UI_TEXT.pages.about.values;

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          {UI_TEXT.pages.about.heroBadge}
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-main leading-tight tracking-tight">
          {UI_TEXT.pages.about.heroTitleMain}{" "}
          <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
            {UI_TEXT.pages.about.heroTitleHighlight}
          </span>
        </h1>
        <p className="text-lg text-text-sec max-w-[600px] mx-auto leading-relaxed">
          {UI_TEXT.pages.about.heroDescription}
        </p>
      </section>

      {/* Problem */}
      <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-4">
        <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.about.problemTitle}</h2>
        <div className="grid md:grid-cols-2 gap-6 text-text-sec text-sm leading-relaxed">
          <div className="space-y-2">
            <p className="font-medium text-text-main">{UI_TEXT.pages.about.problemClientTitle}</p>
            <p>{UI_TEXT.pages.about.problemClientText}</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-text-main">{UI_TEXT.pages.about.problemMasterTitle}</p>
            <p>{UI_TEXT.pages.about.problemMasterText}</p>
          </div>
        </div>
        <p className="text-text-sec text-sm leading-relaxed pt-2 border-t border-border-subtle">
          {UI_TEXT.pages.about.problemSummary}
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div
            key={s.value}
            className="lux-card rounded-[20px] bg-bg-card p-6 text-center space-y-1"
          >
            <div className="text-3xl font-bold text-text-main">{s.value}</div>
            <div className="text-sm text-text-sec">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Values */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.about.valuesTitle}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4"
            >
              <div className="text-2xl shrink-0">{v.icon}</div>
              <div>
                <p className="font-semibold text-text-main mb-1">{v.title}</p>
                <p className="text-sm text-text-sec leading-relaxed">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-4">
        <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.about.ctaTitle}</h2>
        <p className="text-text-sec text-sm">{UI_TEXT.pages.about.ctaText}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/catalog"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-6 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            {UI_TEXT.pages.about.ctaFindMaster}
          </Link>
          <Link
            href="/become-master"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-bg-card px-6 text-sm font-semibold text-text-main hover:bg-bg-input transition-colors"
          >
            {UI_TEXT.pages.about.ctaBecomeMaster}
          </Link>
        </div>
      </section>
    </main>
  );
}


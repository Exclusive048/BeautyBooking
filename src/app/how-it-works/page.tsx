import type { Metadata } from "next";
import Link from "next/link";
import { User, Scissors, Building2 } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import type { DynamicIconName } from "@/components/ui/dynamic-icon";

export const metadata: Metadata = {
  title: UI_TEXT.pages.howItWorks.title,
  description: UI_TEXT.pages.howItWorks.description,
  alternates: { canonical: "/how-it-works" },
};

const CLIENT_STEPS = UI_TEXT.pages.howItWorks.clientSteps;
const MASTER_STEPS = UI_TEXT.pages.howItWorks.masterSteps;
const KILLER_FEATURES = UI_TEXT.pages.howItWorks.features;

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-20">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.howItWorks.navLabel}>

        {/* Hero */}
        <section className="text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
            {UI_TEXT.pages.howItWorks.heroBadge}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-text-main leading-tight tracking-tight">
            {UI_TEXT.pages.howItWorks.heroTitleMain}{" "}
            <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
              {UI_TEXT.pages.howItWorks.heroTitleHighlight}
            </span>
          </h1>
          <p className="text-text-sec text-lg max-w-[540px] mx-auto">
            {UI_TEXT.pages.howItWorks.heroSubtitle}
          </p>
        </section>

        {/* Client flow */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-text-sec shrink-0" aria-hidden />
            <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.howItWorks.clientTitle}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {CLIENT_STEPS.map((s) => (
              <div key={s.step} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
                <div className="text-3xl font-black text-primary/20 leading-none shrink-0 select-none">
                  {s.step}
                </div>
                <div>
                  <p className="font-semibold text-text-main mb-1">{s.title}</p>
                  <p className="text-sm text-text-sec leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Link
              href="/catalog"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-6 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
            >
              {UI_TEXT.pages.howItWorks.clientCta}
            </Link>
          </div>
        </section>

        {/* Master flow */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <Scissors className="h-6 w-6 text-text-sec shrink-0" aria-hidden />
            <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.howItWorks.masterTitle}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {MASTER_STEPS.map((s) => (
              <div key={s.step} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
                <div className="text-3xl font-black text-primary/20 leading-none shrink-0 select-none">
                  {s.step}
                </div>
                <div>
                  <p className="font-semibold text-text-main mb-1">{s.title}</p>
                  <p className="text-sm text-text-sec leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Link
              href="/become-master"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-6 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
            >
              {UI_TEXT.pages.howItWorks.masterCta}
            </Link>
          </div>
        </section>

        {/* Killer features */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.howItWorks.featuresTitle}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {KILLER_FEATURES.map((f) => (
              <div key={f.title} className="lux-card rounded-[20px] bg-bg-card p-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <DynamicIcon name={f.icon as DynamicIconName} className="h-6 w-6 text-primary shrink-0" aria-hidden />
                  <span className="rounded-full border border-border-subtle px-3 py-0.5 text-xs text-text-sec">
                    {f.badge}
                  </span>
                </div>
                <p className="font-semibold text-text-main">{f.title}</p>
                <p className="text-sm text-text-sec leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Studio block */}
        <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-text-sec shrink-0" aria-hidden />
            <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.howItWorks.studioTitle}</h2>
          </div>
          <p className="text-text-sec text-sm leading-relaxed">
            {UI_TEXT.pages.howItWorks.studioText}
          </p>
          <Link
            href="/become-master"
            className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
          >
            {UI_TEXT.pages.howItWorks.studioCta}
          </Link>
        </section>

      </InfoPageLayout>
    </main>
  );
}

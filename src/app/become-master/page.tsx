import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import type { DynamicIconName } from "@/components/ui/dynamic-icon";

export const metadata: Metadata = {
  title: UI_TEXT.pages.becomeMaster.title,
  description: UI_TEXT.pages.becomeMaster.description,
  alternates: { canonical: "/become-master" },
};

const ADVANTAGES = UI_TEXT.pages.becomeMaster.advantages;
const HOW_TO_START = UI_TEXT.pages.becomeMaster.startSteps;

export default function BecomeMasterPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-20">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.becomeMaster.navLabel}>

        {/* Hero */}
        <section className="text-center space-y-5 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
            {UI_TEXT.pages.becomeMaster.heroBadge}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-text-main leading-tight tracking-tight">
            {UI_TEXT.pages.becomeMaster.heroTitleMain}{" "}
            <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
              {UI_TEXT.pages.becomeMaster.heroTitleHighlight}
            </span>
          </h1>
          <p className="text-text-sec text-lg max-w-[540px] mx-auto">
            {UI_TEXT.pages.becomeMaster.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-8 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
            >
              {UI_TEXT.pages.becomeMaster.ctaPrimary}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-border-subtle bg-bg-card px-6 text-sm font-semibold text-text-main hover:bg-bg-input transition-colors"
            >
              {UI_TEXT.pages.becomeMaster.ctaSecondary}
            </Link>
          </div>
          <p className="text-xs text-text-sec">{UI_TEXT.pages.becomeMaster.heroNote}</p>
        </section>

        {/* Advantages */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-text-main text-center">
            {UI_TEXT.pages.becomeMaster.advantagesTitle}
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {ADVANTAGES.map((a) => (
              <div key={a.title} className="lux-card rounded-[20px] bg-bg-card p-6 space-y-3">
                <DynamicIcon name={a.icon as DynamicIconName} className="h-6 w-6 text-primary" aria-hidden />
                <p className="font-semibold text-text-main text-sm">{a.title}</p>
                <p className="text-xs text-text-sec leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How to start */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.becomeMaster.startTitle}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {HOW_TO_START.map((s) => (
              <div key={s.step} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-magenta flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {s.step}
                </div>
                <div>
                  <p className="font-semibold text-text-main text-sm">{s.title}</p>
                  <p className="text-xs text-text-sec leading-relaxed mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.becomeMaster.pricingTitle}</h2>
            <p className="text-text-sec text-sm max-w-[400px]">
              {UI_TEXT.pages.becomeMaster.pricingText}
            </p>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 inline-flex h-10 items-center justify-center rounded-xl border border-border-subtle bg-bg-input px-6 text-sm font-semibold text-text-main hover:bg-bg-card transition-colors"
          >
            {UI_TEXT.pages.becomeMaster.pricingCta}
          </Link>
        </section>

        {/* Studio section */}
        <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-text-sec shrink-0" aria-hidden />
            <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.becomeMaster.studioTitle}</h2>
          </div>
          <p className="text-text-sec text-sm leading-relaxed">
            {UI_TEXT.pages.becomeMaster.studioText}
          </p>
          <Link
            href="/help/masters"
            className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
          >
            {UI_TEXT.pages.becomeMaster.studioCta}
          </Link>
        </section>

      </InfoPageLayout>
    </main>
  );
}

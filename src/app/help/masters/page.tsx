import type { Metadata } from "next";
import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import type { DynamicIconName } from "@/components/ui/dynamic-icon";
import { FAQAccordionItem } from "@/components/ui/faq-accordion";

export const metadata: Metadata = {
  title: UI_TEXT.pages.helpMasters.title,
  description: UI_TEXT.pages.helpMasters.description,
};

const SECTIONS = UI_TEXT.pages.helpMasters.sections;

export default function HelpMastersPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-12">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.helpMasters.navLabel}>

        {/* Hero */}
        <section className="space-y-3 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
            {UI_TEXT.pages.helpMasters.heroBadge}
          </div>
          <h1 className="text-4xl font-bold text-text-main tracking-tight">
            {UI_TEXT.pages.helpMasters.heroTitle}
          </h1>
          <p className="text-text-sec text-lg">
            {UI_TEXT.pages.helpMasters.heroSubtitle}
          </p>
        </section>

        {/* Quick nav */}
        <nav className="lux-card rounded-[20px] bg-bg-card p-5">
          <p className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-3">
            {UI_TEXT.pages.helpMasters.quickNavTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-input px-3 py-1.5 text-sm text-text-main hover:bg-bg-card transition-colors"
              >
                <DynamicIcon name={s.icon as DynamicIconName} className="h-4 w-4 shrink-0" aria-hidden />
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-6 space-y-4">
            <div className="flex items-center gap-3">
              <DynamicIcon name={section.icon as DynamicIconName} className="h-6 w-6 text-primary shrink-0" aria-hidden />
              <h2 className="text-xl font-semibold text-text-main">{section.title}</h2>
            </div>
            <div className="space-y-2">
              {section.items.map((item) => (
                <FAQAccordionItem key={item.q} item={item} />
              ))}
            </div>
          </section>
        ))}

        {/* Footer links */}
        <section className="lux-card rounded-[20px] bg-bg-card p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <p className="font-semibold text-text-main text-sm">{UI_TEXT.pages.helpMasters.footerTitle}</p>
            <p className="text-text-sec text-sm mt-0.5">{UI_TEXT.pages.helpMasters.footerSubtitle}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/support"
              className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-4 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
            >
              {UI_TEXT.pages.helpMasters.footerSupport}
            </Link>
            <Link
              href="/faq"
              className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-4 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
            >
              {UI_TEXT.pages.helpMasters.footerFaq}
            </Link>
          </div>
        </section>

      </InfoPageLayout>
    </main>
  );
}

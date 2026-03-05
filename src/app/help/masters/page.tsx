import type { Metadata } from "next";
import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.helpMasters.title,
  description: UI_TEXT.pages.helpMasters.description,
};

const SECTIONS = UI_TEXT.pages.helpMasters.sections;

export default function HelpMastersPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-12">

      {/* Hero */}
      <section className="space-y-3">
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
              <span>{s.icon}</span>
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{section.icon}</span>
            <h2 className="text-xl font-semibold text-text-main">{section.title}</h2>
          </div>
          <div className="space-y-2">
            {section.items.map((item) => (
              <details key={item.q} className="lux-card rounded-[16px] bg-bg-card group">
                <summary className="flex items-center justify-between cursor-pointer p-5 font-medium text-sm text-text-main list-none">
                  {item.q}
                  <span className="ml-4 shrink-0 text-text-sec group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{item.a}</p>
              </details>
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
    </main>
  );
}


import type { Metadata } from "next";
import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.faq.title,
  description: UI_TEXT.pages.faq.description,
};

const FAQS = UI_TEXT.pages.faq.groups;

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-[820px] px-4 py-12 md:py-20 space-y-14">

      {/* Hero */}
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          {UI_TEXT.pages.faq.heroBadge}
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          {UI_TEXT.pages.faq.heroTitle}
        </h1>
        <p className="text-text-sec text-lg">
          {UI_TEXT.pages.faq.heroSubtitlePrefix}{" "}
          <Link href="/support" className="text-primary hover:underline">
            {UI_TEXT.pages.faq.heroSubtitleLink}
          </Link>
          .
        </p>
      </section>

      {/* FAQ groups */}
      {FAQS.map((group) => (
        <section key={group.group} className="space-y-4">
          <h2 className="text-lg font-semibold text-text-main">{group.group}</h2>
          <div className="space-y-2">
            {group.items.map((item) => (
              <details key={item.q} className="lux-card rounded-[16px] bg-bg-card group">
                <summary className="flex items-center justify-between cursor-pointer p-5 font-medium text-sm text-text-main list-none gap-4">
                  <span>{item.q}</span>
                  <span className="shrink-0 text-text-sec group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      {/* Contact */}
      <section className="lux-card rounded-[20px] bg-bg-card p-7 text-center space-y-3">
        <p className="font-semibold text-text-main">{UI_TEXT.pages.faq.contactTitle}</p>
        <p className="text-sm text-text-sec">{UI_TEXT.pages.faq.contactSubtitle}</p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/support"
            className="inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-5 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            {UI_TEXT.pages.faq.contactPrimary}
          </Link>
          <a
            href="https://t.me/masterryadom_support_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
          >
            {UI_TEXT.pages.faq.contactTelegram}
          </a>
        </div>
      </section>
    </main>
  );
}


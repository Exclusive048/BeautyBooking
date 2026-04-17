import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import type { DynamicIconName } from "@/components/ui/dynamic-icon";

export const metadata: Metadata = {
  title: UI_TEXT.pages.partners.title,
  description: UI_TEXT.pages.partners.description,
};

const PARTNERSHIP_TYPES = UI_TEXT.pages.partners.types;

export default function PartnersPage() {
  return (
    <main className="mx-auto max-w-[860px] px-4 py-12 md:py-20 space-y-16">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.partners.navLabel}>

        {/* Hero */}
        <section className="text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
            {UI_TEXT.pages.partners.heroBadge}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-text-main tracking-tight">
            {UI_TEXT.pages.partners.heroTitleMain}{" "}
            <span className="bg-gradient-to-r from-primary to-primary-magenta bg-clip-text text-transparent">
              {UI_TEXT.pages.partners.heroTitleHighlight}
            </span>
          </h1>
          <p className="text-text-sec text-lg max-w-[520px] mx-auto">
            {UI_TEXT.pages.partners.heroSubtitle}
          </p>
        </section>

        {/* Partnership types */}
        <section className="grid md:grid-cols-2 gap-4">
          {PARTNERSHIP_TYPES.map((p) => (
            <div key={p.title} className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-4">
              <DynamicIcon name={p.icon as DynamicIconName} className="h-6 w-6 shrink-0 text-primary mt-0.5" aria-hidden />
              <div>
                <p className="font-semibold text-text-main mb-1">{p.title}</p>
                <p className="text-sm text-text-sec leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Contact */}
        <section className="lux-card rounded-[24px] bg-bg-card p-8 md:p-10 space-y-6">
          <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.partners.contactTitle}</h2>
          <p className="text-text-sec text-sm leading-relaxed">
            {UI_TEXT.pages.partners.contactSubtitle}
          </p>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-text-sec shrink-0" aria-hidden />
              <div>
                <p className="text-text-sec text-xs mb-0.5">{UI_TEXT.pages.partners.emailLabel}</p>
                <a
                  href="mailto:partners@МастерРядом.ru"
                  className="text-text-main font-medium hover:text-primary transition-colors"
                >
                  partners@МастерРядом.ru
                </a>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-text-sec shrink-0" aria-hidden />
              <div>
                <p className="text-text-sec text-xs mb-0.5">{UI_TEXT.pages.partners.telegramLabel}</p>
                <a
                  href="https://t.me/МастерРядом_partner"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-main font-medium hover:text-primary transition-colors"
                >
                  @МастерРядом_partner
                </a>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-sec border-t border-border-subtle pt-4">
            {UI_TEXT.pages.partners.footerNote}
          </p>
        </section>

      </InfoPageLayout>
    </main>
  );
}

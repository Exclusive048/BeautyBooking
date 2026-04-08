import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { FooterCTA } from "@/components/layout/footer/FooterCTA";
import { FooterColumn, type FooterLinkItem } from "@/components/layout/footer/FooterColumn";
import { FooterCopyright } from "@/components/layout/footer/FooterCopyright";
import { FooterSocials } from "@/components/layout/footer/FooterSocials";
import { UI_TEXT } from "@/lib/ui/text";

const APP_ROOT = path.join(process.cwd(), "src", "app");

function hasPage(route: string): boolean {
  const normalized = route.replace(/^\/+/, "");
  const pageDir = path.join(APP_ROOT, normalized);
  return (
    fs.existsSync(path.join(pageDir, "page.tsx")) ||
    fs.existsSync(path.join(pageDir, "page.ts"))
  );
}

function buildFooterLinks() {
  const showBlog = hasPage("blog");
  const showCareers = hasPage("careers");
  const showGiftCards = hasPage("gift-cards");
  const hasSupportPage = hasPage("support");

  const about: FooterLinkItem[] = [
    { label: UI_TEXT.footer.links.about, href: "/about" },
    { label: UI_TEXT.footer.links.howItWorks, href: "/how-it-works" },
    ...(showBlog ? [{ label: UI_TEXT.footer.links.blog, href: "/blog" }] : []),
    { label: UI_TEXT.footer.links.partners, href: "/partners" },
    ...(showCareers ? [{ label: UI_TEXT.footer.links.careers, href: "/careers" }] : []),
  ];

  const clients: FooterLinkItem[] = [
    { label: UI_TEXT.footer.links.howToBook, href: "/how-to-book" },
    { label: UI_TEXT.footer.links.popularServices, href: "/catalog?sort=popular" },
    { label: UI_TEXT.footer.links.mastersNearby, href: "/catalog?available=today" },
    { label: UI_TEXT.footer.links.offersForModels, href: "/models" },
    ...(showGiftCards ? [{ label: UI_TEXT.footer.links.giftCards, href: "/gift-cards" }] : []),
  ];

  const masters: FooterLinkItem[] = [
    { label: UI_TEXT.footer.links.becomeMaster, href: "/become-master" },
    { label: UI_TEXT.footer.links.pricing, href: "/pricing" },
    { label: UI_TEXT.footer.links.knowledgeBase, href: "/help/masters" },
    { label: UI_TEXT.footer.links.affiliateProgram, href: "/partners" },
  ];

  const support: FooterLinkItem[] = [
    { label: UI_TEXT.footer.links.faq, href: "/faq" },
    hasSupportPage
      ? { label: UI_TEXT.footer.links.contact, href: "/support" }
      : { label: UI_TEXT.footer.links.contact, href: "mailto:support@мастеррядом.online", external: true },
    { label: UI_TEXT.footer.links.telegramSupport, href: "https://t.me/masterryadom_support_bot", external: true },
    { label: UI_TEXT.footer.links.terms, href: "/terms" },
    { label: UI_TEXT.footer.links.privacy, href: "/privacy" },
  ];

  return { about, clients, masters, support };
}

export function Footer() {
  const { about, clients, masters, support } = buildFooterLinks();

  return (
    <footer
      role="contentinfo"
      className="border-t border-border-subtle/60 bg-bg-card/50 text-text-main"
      itemScope
      itemType="https://schema.org/WPFooter"
    >
      <div className="mx-auto max-w-[1280px] px-4 py-12 md:py-16">
        {/* CTA Banner */}
        <FooterCTA />

        {/* Main grid */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,3fr)]">
          {/* Brand column */}
          <div className="space-y-5">
            <Link href="/" className="inline-block">
              <span className="text-lg font-bold bg-gradient-to-r from-violet-600 to-pink-500 bg-clip-text text-transparent">
                {UI_TEXT.brand.name}
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-text-sec">{UI_TEXT.footer.brandDescription}</p>
            <FooterSocials />
          </div>

          {/* Links grid */}
          <nav aria-label={UI_TEXT.footer.aria.nav}>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <FooterColumn title={UI_TEXT.footer.columns.about} links={about} />
              <FooterColumn title={UI_TEXT.footer.columns.clients} links={clients} />
              <FooterColumn title={UI_TEXT.footer.columns.masters} links={masters} />
              <FooterColumn title={UI_TEXT.footer.columns.support} links={support} />
            </div>
          </nav>
        </div>

        {/* Copyright */}
        <div className="mt-12 border-t border-border-subtle/60 pt-6">
          <FooterCopyright />
        </div>
      </div>
    </footer>
  );
}

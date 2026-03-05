import { FooterLink } from "@/components/layout/footer/FooterLink";
import { UI_TEXT } from "@/lib/ui/text";

const CURRENT_YEAR = new Date().getFullYear();
const COPYRIGHT_TEXT = UI_TEXT.footer.legal.copyright.replace("{year}", String(CURRENT_YEAR));
// TODO: Replace legal entity details before production launch.
const LEGAL_ENTITY_TEXT = UI_TEXT.footer.legal.entity;

const LEGAL_LINKS = [
  { label: UI_TEXT.footer.links.privacy, href: "/privacy" },
  { label: UI_TEXT.footer.links.terms, href: "/terms" },
];

export function FooterCopyright() {
  return (
    <div className="flex flex-col gap-2 text-[13px] text-text-sec md:flex-row md:flex-wrap md:items-center">
      <span>{COPYRIGHT_TEXT}</span>
      <div className="flex flex-wrap items-center gap-2">
        {LEGAL_LINKS.map((link) => (
          <span key={link.href} className="flex items-center gap-2">
            <span aria-hidden="true">•</span>
            <FooterLink href={link.href} className="text-[13px]">
              {link.label}
            </FooterLink>
          </span>
        ))}
      </div>
      <span className="text-text-sec">•</span>
      <span>{LEGAL_ENTITY_TEXT}</span>
    </div>
  );
}


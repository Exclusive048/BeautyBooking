import { FooterLink } from "@/components/layout/footer/FooterLink";
import { env } from "@/lib/env";
import { UI_TEXT } from "@/lib/ui/text";

const CURRENT_YEAR = new Date().getFullYear();
const COPYRIGHT_TEXT = UI_TEXT.footer.legal.copyright.replace("{year}", String(CURRENT_YEAR));
// FIX-EXP-CONTENT-GRAMMAR (EXP-005): the real ИНН comes from
// `NEXT_PUBLIC_LEGAL_INN`. When it's unset (or the old fake "1234567890"), show
// an OBVIOUS bracketed placeholder — never a fake-looking real number. Set the
// real requisites before launch (deploy-checklist «legal requisites»).
const RAW_INN = env.NEXT_PUBLIC_LEGAL_INN?.trim();
const INN_VALUE =
  RAW_INN && RAW_INN !== "1234567890" ? RAW_INN : UI_TEXT.footer.legal.innUnset;
const LEGAL_ENTITY_TEXT = UI_TEXT.footer.legal.entityTemplate.replace("{inn}", INN_VALUE);

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


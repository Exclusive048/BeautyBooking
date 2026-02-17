import { FooterLink } from "@/components/layout/footer/FooterLink";

const COPYRIGHT_TEXT = "© 2026 BeautyHub";
const LEGAL_ENTITY_TEXT = "ИП Иванов Иван Иванович, ИНН 1234567890";

const LEGAL_LINKS = [
  { label: "Политика конфиденциальности", href: "/privacy" },
  { label: "Пользовательское соглашение", href: "/terms" },
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

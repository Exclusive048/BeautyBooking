import { FooterLink } from "@/components/layout/footer/FooterLink";

export type FooterLinkItem = {
  label: string;
  href: string;
  external?: boolean;
};

type FooterColumnProps = {
  title: string;
  links: FooterLinkItem[];
};

export function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-text-main">{title}</div>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <FooterLink href={link.href} external={link.external}>
              {link.label}
            </FooterLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

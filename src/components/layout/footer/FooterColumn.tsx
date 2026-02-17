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
    <div className="space-y-3">
      <div className="text-[14px] font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
        {title}
      </div>
      <ul className="space-y-2">
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

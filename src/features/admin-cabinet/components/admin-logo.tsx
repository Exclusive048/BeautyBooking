import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * Sidebar brand block. Pairs the shared `<BrandLogo>` wordmark with an
 * "АДМИН-ПАНЕЛЬ" caption rendered in font-mono uppercase tracking — the
 * same treatment the cabinet master shell uses for its section subtitle
 * so the two surfaces feel like siblings of one design system.
 *
 * Always links to `/admin` (dashboard root) so clicking the logo is a
 * reliable escape hatch from any sub-page.
 */
export function AdminLogo() {
  return (
    <Link
      href="/admin"
      aria-label={UI_TEXT.adminPanel.title}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <BrandLogo variant="full" size="sm" href={null} />
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {UI_TEXT.adminPanel.caption}
      </p>
    </Link>
  );
}

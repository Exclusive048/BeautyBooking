import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studio: {
    name: string;
    mastersCount: number;
    publicHref: string | null;
  };
};

const T = UI_TEXT.studioCabinet.topbar;

/**
 * Minimalistic sticky topbar for /cabinet/studio/*. Surfaces the
 * studio identity chip (name + master count) and a theme toggle.
 * Per-page headers live inside each page (mirroring the
 * `<MasterPageHeader>` pattern); the topbar stays intentionally lean
 * so it does not compete with page-level chrome.
 *
 * Sits below the global navbar via `top-[var(--topbar-h)]`. Pages
 * that need their own sticky header should park themselves below
 * the topbar (e.g. `top-[calc(var(--topbar-h)+var(--studio-topbar-h))]`)
 * — but since per-page headers come in subsequent commits, no global
 * variable is exposed yet.
 */
export function StudioTopbar({ studio }: Props) {
  const chipText = T.studioChip
    .replace("{name}", studio.name)
    .replace("{count}", String(studio.mastersCount));

  return (
    <header className="sticky top-[var(--topbar-h)] z-20 border-b border-border-subtle bg-bg-page/85 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3 md:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-bg-card px-3 py-1 text-xs font-medium text-text-main">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{chipText}</span>
          </span>
          {studio.publicHref ? (
            <Link
              href={studio.publicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1 text-xs text-text-sec transition-colors hover:text-text-main md:inline-flex"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              <span>{T.openPublicPage}</span>
            </Link>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

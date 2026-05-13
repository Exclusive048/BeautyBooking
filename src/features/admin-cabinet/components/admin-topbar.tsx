"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  resolveAdminBreadcrumbs,
  type AdminCrumb,
} from "@/features/admin-cabinet/config/admin-breadcrumbs";
import { matchAdminNavItem } from "@/features/admin-cabinet/config/admin-nav";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  /** Opens the mobile drawer. Lives on the shell wrapper because the
   * sidebar is rendered in a separate column on desktop and as a sheet
   * on mobile — both states share one toggle. */
  onOpenMobileNav: () => void;
};

function renderCrumbs(crumbs: AdminCrumb[]) {
  return (
    <nav
      aria-label={UI_TEXT.adminPanel.aria.breadcrumb}
      className="flex items-center gap-1.5 text-xs text-text-sec"
    >
      <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
      {crumbs.map((crumb, index) => (
        <Fragment key={`${crumb.label}-${index}`}>
          {index > 0 ? (
            <ChevronRight
              className="h-3 w-3 shrink-0 text-text-sec/60"
              aria-hidden
            />
          ) : null}
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="rounded transition-colors hover:text-text-main"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-text-main">{crumb.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/**
 * Sticky page header above the admin content area. Resolves breadcrumb,
 * page title, and sublabel from the current pathname via `ADMIN_NAV` so
 * every admin route gets a consistent header without each page wiring
 * the chrome itself.
 *
 * `top-[var(--topbar-h)]` parks the header right under the global navbar
 * (defined by `<AppShell>` at 72px), same pattern as `<MasterPageHeader>`.
 */
export function AdminTopbar({ onOpenMobileNav }: Props) {
  const pathname = usePathname();
  const crumbs = resolveAdminBreadcrumbs(pathname);
  const current = matchAdminNavItem(pathname);
  const title = current?.pageTitle ?? UI_TEXT.adminPanel.breadcrumb.root;
  const sublabel = current?.sublabel ?? "";

  return (
    <header className="sticky top-[var(--topbar-h)] z-20 border-b border-border-subtle bg-bg-page/85 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-4 md:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label={UI_TEXT.adminPanel.mobile.openMenu}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-card text-text-sec shadow-sm transition-colors hover:text-text-main lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1">{renderCrumbs(crumbs)}</div>
          <div className="flex items-baseline gap-3">
            <h1 className="truncate font-display text-lg font-semibold tracking-tight text-text-main md:text-xl">
              {title}
            </h1>
            {sublabel ? (
              <span className="truncate text-sm text-text-sec">{sublabel}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CreditCard, FolderTree, LayoutDashboard, MapPin, Menu, Settings, Star, Users, X } from "lucide-react";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { UI_TEXT } from "@/lib/ui/text";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
};

const ITEMS: NavItem[] = [
  { href: "/admin", label: UI_TEXT.admin.nav.dashboard, icon: LayoutDashboard, exact: true },
  { href: "/admin/catalog", label: UI_TEXT.admin.nav.catalog, icon: FolderTree },
  { href: "/admin/cities", label: UI_TEXT.admin.nav.cities, icon: MapPin },
  { href: "/admin/users", label: UI_TEXT.admin.nav.users, icon: Users },
  { href: "/admin/billing", label: UI_TEXT.admin.nav.billing, icon: CreditCard },
  { href: "/admin/reviews", label: UI_TEXT.admin.nav.reviews, icon: Star },
  { href: "/admin/settings", label: UI_TEXT.admin.nav.settings, icon: Settings },
];

function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = UI_TEXT.admin.nav;

  useEffect(() => {
    // Closes mobile drawer on route change — intentional setState in effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false);
  }, [pathname]);

  const navItems = (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => (
        <SidebarItem
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={isActivePath(pathname, item.href, item.exact)}
        />
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile: top strip with burger button */}
      <div className="mb-4 flex items-center gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t.openMenu}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-bg-card text-text-sec shadow-sm transition-colors hover:text-text-main"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-text-main">{t.sectionLabel}</span>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t.sectionLabel}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-text-sec">
                {t.sectionLabel}
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t.closeMenu}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-sec transition-colors hover:text-text-main"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {navItems}
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="sticky top-[calc(var(--topbar-h)+24px)] hidden h-fit lg:block">
        <div className="lux-card rounded-[24px] border border-border-subtle/80 bg-bg-card/80 p-3 shadow-card backdrop-blur">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-text-sec">
            {t.sectionLabel}
          </div>
          {navItems}
        </div>
      </aside>
    </>
  );
}

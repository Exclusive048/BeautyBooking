"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, User, Settings, Briefcase, Sparkles } from "lucide-react";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { UI_TEXT } from "@/lib/ui/text";

const NAV_ITEMS = [
  { label: UI_TEXT.clientCabinet.nav.home, href: "/cabinet", icon: LayoutDashboard, exact: true },
  { label: UI_TEXT.clientCabinet.nav.bookings, href: "/cabinet/bookings", icon: Calendar },
  { label: UI_TEXT.clientCabinet.nav.profile, href: "/cabinet/profile", icon: User },
  { label: UI_TEXT.clientCabinet.nav.modelApplications, href: "/cabinet/model-applications", icon: Sparkles },
  { label: UI_TEXT.clientCabinet.nav.roles, href: "/cabinet/roles", icon: Briefcase },
  { label: UI_TEXT.clientCabinet.nav.settings, href: "/cabinet/settings", icon: Settings },
];

type Props = {
  userLabel?: string | null;
};

function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function CabinetSidebar({ userLabel }: Props) {
  const pathname = usePathname();
  const label = userLabel?.trim() || UI_TEXT.brand.name;

  return (
    <aside className="w-full lg:w-[272px] lg:shrink-0">
      <div className="glass-panel rounded-[26px] p-4 lg:sticky lg:top-6">
        <div className="flex flex-col gap-5">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-text-sec">
              {UI_TEXT.clientCabinet.nav.sectionLabel}
            </div>
            <div className="truncate text-base font-semibold text-text-main">{label}</div>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href, item.exact);
              return (
                <SidebarItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={active}
                  icon={item.icon}
                />
              );
            })}
          </nav>

          <div className="border-t border-border-subtle/70 pt-3">
            <LogoutButton variant="secondary" size="sm" className="w-full justify-start" />
          </div>
        </div>
      </div>
    </aside>
  );
}

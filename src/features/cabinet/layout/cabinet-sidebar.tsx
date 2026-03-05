"use client";

import { usePathname } from "next/navigation";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { LogoutButton } from "@/features/auth/components/logout-button";

const NAV_ITEMS = [
  { label: "Профиль", href: "/cabinet/profile" },
  { label: "Мои записи", href: "/cabinet/bookings" },
  { label: "Профессиональные роли", href: "/cabinet/roles" },
  { label: "Настройки", href: "/cabinet/settings" },
];

type Props = {
  userLabel?: string | null;
};

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function CabinetSidebar({ userLabel }: Props) {
  const pathname = usePathname();
  const label = userLabel?.trim() || "МастерРядом";

  return (
    <aside className="w-full lg:w-[280px] lg:shrink-0">
      <div className="glass-panel rounded-[26px] p-4 lg:sticky lg:top-6">
        <div className="flex min-h-[320px] flex-col gap-6">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.28em] text-text-sec">Кабинет</div>
            <div className="text-base font-semibold text-text-main">{label}</div>
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <SidebarItem key={item.href} href={item.href} label={item.label} active={active} />
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border-subtle/70 pt-3">
            <LogoutButton variant="secondary" size="sm" className="w-full justify-start" />
          </div>
        </div>
      </div>
    </aside>
  );
}


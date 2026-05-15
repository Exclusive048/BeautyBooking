"use client";

import { usePathname } from "next/navigation";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { AdminLogo } from "@/features/admin-cabinet/components/admin-logo";
import { AdminUserChip } from "@/features/admin-cabinet/components/admin-user-chip";
import { ADMIN_NAV } from "@/features/admin-cabinet/config/admin-nav";
import type { AdminPanelUser } from "@/features/admin-cabinet/types";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  user: AdminPanelUser;
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop sidebar for `/admin/*`. Brand block at the top, a single
 * "Админ-панель" nav group in the middle, user chip pinned beneath
 * the nav. Mirrors the master/studio sidebar layout so the three
 * cabinet surfaces (master, studio, admin) share one mental model.
 *
 * Active item highlight is driven by `usePathname()`; the same
 * matcher used by the breadcrumb resolver — they can never drift
 * apart because both consume `ADMIN_NAV` as the single source of
 * truth.
 */
export function AdminSidebar({ user }: Props) {
  const pathname = usePathname();
  return (
    <aside
      aria-label={UI_TEXT.adminPanel.aria.sidebar}
      className="flex h-full w-64 shrink-0 flex-col"
    >
      <div className="border-b border-border-subtle px-5 py-5">
        <AdminLogo />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
          {UI_TEXT.adminPanel.sectionCaption}
        </p>
        <ul className="flex flex-col gap-1">
          {ADMIN_NAV.map((item) => (
            <li key={item.key}>
              <SidebarItem
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item.href, item.exact)}
              />
            </li>
          ))}
        </ul>
      </nav>

      <AdminUserChip
        name={user.name}
        avatarUrl={user.avatarUrl}
        role={user.role}
      />
    </aside>
  );
}

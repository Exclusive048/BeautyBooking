"use client";

import { useState, type ReactNode } from "react";
import { AdminSidebar } from "@/features/admin-cabinet/components/admin-sidebar";
import { AdminSidebarMobile } from "@/features/admin-cabinet/components/admin-sidebar-mobile";
import { AdminTopbar } from "@/features/admin-cabinet/components/admin-topbar";
import type { AdminPanelUser } from "@/features/admin-cabinet/types";

type Props = {
  user: AdminPanelUser;
  children: ReactNode;
};

/**
 * Client wrapper that ties the admin shell together:
 *   1. Desktop sidebar (column on lg+, hidden on mobile)
 *   2. Sticky topbar with breadcrumbs / title / theme toggle
 *   3. Off-canvas mobile drawer (sheet) triggered from the topbar hamburger
 *
 * The server-side layout passes plain user data; everything inside the
 * shell is client-only because the topbar uses `usePathname()` for
 * breadcrumb resolution and the mobile drawer needs local open/closed
 * state.
 *
 * Layout sits inside `<AppShell>`'s full-width content area (admin is
 * already detected as a workspace route by `AppShellContent`) so the
 * shell itself doesn't need to set any max-width.
 */
export function AdminShell({ user, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-bg-page">
      {/* Desktop sidebar — fixed-width column with its own scroll. */}
      <div className="hidden border-r border-border-subtle lg:block lg:shrink-0">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <AdminSidebar user={user} />
        </div>
      </div>

      {/* Mobile drawer — opened via topbar hamburger. */}
      <AdminSidebarMobile
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        user={user}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onOpenMobileNav={() => setMobileOpen(true)} />
        <div className="flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

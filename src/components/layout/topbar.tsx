/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { MembershipStatus } from "@prisma/client";
import type { ReactElement } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { UI_TEXT } from "@/lib/ui/text";
import { getSiteLogoUrl } from "@/lib/media/queries";
import { AuthUserMenu } from "@/components/layout/auth-user-menu";

export async function Topbar() {
  const user = await getSessionUser();
  const invitesCount = user?.phone
    ? await prisma.studioInvite.count({
        where: { phone: user.phone, status: MembershipStatus.PENDING },
      })
    : 0;
  const unreadNotificationsCount = user
    ? await prisma.notification.count({
        where: { userId: user.id, readAt: null },
      })
    : 0;
  const notificationsCount = invitesCount + unreadNotificationsCount;
  const siteLogoUrl = await getSiteLogoUrl();
  const navItems: ReactElement[] = [];

  if (user) {
    navItems.push(
      <Button key="nav-catalog" asChild variant="secondary">
        <Link href="/catalog">{UI_TEXT.nav.catalog}</Link>
      </Button>
    );

    navItems.push(
      <Button key="nav-notifications" asChild variant="secondary" className="relative">
        <Link href="/cabinet/master/notifications" aria-label={UI_TEXT.nav.notifications}>
          <span aria-hidden>🔔</span>
          {notificationsCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {notificationsCount > 9 ? "9+" : notificationsCount}
            </span>
          ) : null}
        </Link>
      </Button>
    );

    navItems.push(<ThemeToggle key="nav-theme-toggle" />);
    navItems.push(
      <AuthUserMenu
        key="nav-user-menu"
        userLabel={user.displayName?.trim() || user.phone || UI_TEXT.auth.menu}
      />
    );
  } else {
    navItems.push(
      <Button key="nav-catalog" asChild variant="secondary">
        <Link href="/catalog">{UI_TEXT.nav.catalog}</Link>
      </Button>
    );
    navItems.push(<ThemeToggle key="nav-theme-toggle" />);
    navItems.push(
      <Button key="nav-login" asChild>
        <Link href="/login">{UI_TEXT.auth.login}</Link>
      </Button>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur dark:bg-bg/70">
      <div className="mx-auto flex h-[var(--topbar-h)] max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          {siteLogoUrl ? (
            <img src={siteLogoUrl} alt="Site logo" className="h-10 w-10 rounded-2xl object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-2xl bg-neutral-900 dark:bg-accent" />
          )}
          <div className="leading-tight">
            <div className="text-sm font-semibold text-text">BeautyHub</div>
            <div className="text-xs text-text-muted">{UI_TEXT.nav.bookingToMasters}</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">{navItems}</nav>
      </div>
    </header>
  );
}


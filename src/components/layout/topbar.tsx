import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { prisma } from "@/lib/prisma";
import { MembershipStatus } from "@prisma/client";
import type { ReactElement } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { hasGlobalMasterProfile } from "@/lib/auth/roles";
import { hasAnyStudioAccess } from "@/lib/auth/studio-guards";

type CabinetItem = { label: string; href: string };

function buildCabinetNav(input: {
  hasGlobalMaster: boolean;
  hasStudioAccess: boolean;
}): { items: CabinetItem[]; defaultHref: string } {
  const { hasGlobalMaster, hasStudioAccess } = input;
  const items: CabinetItem[] = [
    { label: "Профиль", href: "/cabinet/client?tab=profile" },
    { label: "Мои записи", href: "/cabinet/client?tab=bookings" },
  ];

  if (hasStudioAccess) {
    items.push({ label: "Кабинет студии", href: "/cabinet/studio?tab=bookings" });
  }
  if (hasGlobalMaster) {
    items.push({ label: "Кабинет мастера", href: "/cabinet/master?tab=bookings" });
  }

  const defaultHref = hasStudioAccess
    ? "/cabinet/studio?tab=bookings"
    : hasGlobalMaster
      ? "/cabinet/master?tab=bookings"
      : "/cabinet/client?tab=bookings";

  return { items, defaultHref };
}

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
  const hasGlobalMaster = user ? await hasGlobalMasterProfile(user.id) : false;
  const hasStudioAccess = user ? await hasAnyStudioAccess(user.id) : false;
  const cabinetNav = buildCabinetNav({ hasGlobalMaster, hasStudioAccess });
  const navItems: ReactElement[] = [];

  navItems.push(
    <Button key="nav-catalog" asChild variant="secondary">
      <Link href="/providers">Каталог</Link>
    </Button>
  );

  if (user) {
    navItems.push(
      <details key="nav-cabinet" className="relative">
        <Button asChild variant="secondary">
          <summary className="list-none cursor-pointer">Мой кабинет</summary>
        </Button>
        <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-lg p-1">
          {cabinetNav.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    );

    navItems.push(
      <Button key="nav-notifications" asChild variant="secondary" className="relative">
        <Link href="/cabinet/invites" aria-label="Уведомления">
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
    navItems.push(<LogoutButton key="nav-logout" />);
  } else {
    navItems.push(<ThemeToggle key="nav-theme-toggle" />);
    navItems.push(
      <Button key="nav-login" asChild>
        <Link href="/login">Вход</Link>
      </Button>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur dark:bg-bg/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-neutral-900 dark:bg-accent" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-text">BeautyHub</div>
            <div className="text-xs text-text-muted">Запись к мастерам</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">{navItems}</nav>
      </div>
    </header>
  );
}

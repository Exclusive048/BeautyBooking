import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { prisma } from "@/lib/prisma";
import { MembershipStatus } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { hasGlobalMasterProfile } from "@/lib/auth/roles";
import { hasAnyStudioAccess } from "@/lib/auth/studio-guards";

type PrimaryNavItem =
  | { mode: "single"; label: string; href: string }
  | { mode: "dropdown"; label: string; href: string; items: { label: string; href: string }[] };

function buildPrimaryNavItem(input: {
  hasGlobalMaster: boolean;
  hasStudioAccess: boolean;
}): PrimaryNavItem | null {
  const { hasGlobalMaster, hasStudioAccess } = input;
  const showDropdown = hasStudioAccess && hasGlobalMaster;

  if (showDropdown) {
    return {
      mode: "dropdown",
      label: "Мои студии",
      href: "/cabinet/studio?tab=bookings",
      items: [{ label: "Мой кабинет", href: "/cabinet/master?tab=bookings" }],
    };
  }

  if (hasStudioAccess) {
    return { mode: "single", label: "Мои студии", href: "/cabinet/studio?tab=bookings" };
  }

  if (hasGlobalMaster) {
    return { mode: "single", label: "Мой кабинет", href: "/cabinet/master?tab=bookings" };
  }

  return null;
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
  const primaryNav = buildPrimaryNavItem({ hasGlobalMaster, hasStudioAccess });

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

        <nav className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/providers">Каталог</Link>
          </Button>

          {user ? (
            <>
              <Button asChild variant="secondary">
                <Link href="/cabinet?tab=bookings">Мои записи</Link>
              </Button>

              <Button asChild variant="secondary">
                <Link href="/cabinet?tab=profile">Профиль</Link>
              </Button>
              {primaryNav ? (
                primaryNav.mode === "single" ? (
                  <Button asChild variant="secondary">
                    <Link href={primaryNav.href}>{primaryNav.label}</Link>
                  </Button>
                ) : (
                  <div className="relative flex items-center gap-1">
                    <Button asChild variant="secondary">
                      <Link href={primaryNav.href}>{primaryNav.label}</Link>
                    </Button>
                    <details className="relative">
                      <summary className="list-none rounded-xl border px-2 py-2 text-sm font-medium hover:bg-neutral-50 cursor-pointer">
                        ▾
                      </summary>
                      <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-white shadow-lg p-1">
                        {primaryNav.items.map((item) => (
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
                  </div>
                )
              ) : null}

              <Button asChild variant="secondary" className="relative">
                <Link href="/cabinet/invites" aria-label="Уведомления">
                  <span aria-hidden>🔔</span>
                  {notificationsCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {notificationsCount > 9 ? "9+" : notificationsCount}
                    </span>
                  ) : null}
                </Link>
              </Button>

              <ThemeToggle />
              <LogoutButton />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Button asChild>
                <Link href="/login">Вход</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { prisma } from "@/lib/prisma";
import { AccountType, MembershipStatus } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";

export async function Topbar() {
  const user = await getSessionUser();
  const hasInvites = user?.phone
    ? Boolean(
        await prisma.studioInvite.findFirst({
          where: { phone: user.phone, status: MembershipStatus.PENDING },
          select: { id: true },
        })
      )
    : false;
  const roles = user?.roles ?? [];
  const hasMasterRole = roles.includes(AccountType.MASTER);
  const hasStudioRole =
    roles.includes(AccountType.STUDIO) || roles.includes(AccountType.STUDIO_ADMIN);
  const hasActiveMembership = user
    ? Boolean(
        await prisma.studioMembership.findFirst({
          where: { userId: user.id, status: MembershipStatus.ACTIVE },
          select: { id: true },
        })
      )
    : false;
  const showStudios = hasStudioRole || hasActiveMembership;

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

              {showStudios ? (
                <Button asChild variant="secondary">
                  <Link href="/cabinet/studio">Мои студии</Link>
                </Button>
              ) : null}

              {hasMasterRole ? (
                <Button asChild variant="secondary">
                  <Link href="/cabinet/master">Мой кабинет</Link>
                </Button>
              ) : null}

              <Button asChild variant="secondary" className="relative">
                <Link href="/cabinet/invites" aria-label="Уведомления">
                  <span aria-hidden>🔔</span>
                  {hasInvites ? (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
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
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { MembershipStatus, StudioRole } from "@prisma/client";
import { AuthMobileMenu } from "@/components/layout/auth-mobile-menu";
import { AuthUserMenu } from "@/components/layout/auth-user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { MASTER_CABINET_PATH, STUDIO_CABINET_PATH } from "@/lib/auth/cabinet-paths";
import { hasAdminRole } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { getSiteLogoUrl } from "@/lib/media/queries";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";

type WorkspaceLink = {
  href: string;
  label: string;
  ariaLabel: string;
  avatarUrl: string | null;
  fallbackIcon: string;
};

function WorkspaceShortcutLink({ item }: { item: WorkspaceLink }) {
  return (
    <Button asChild variant="secondary" size="icon" className="h-11 w-11 rounded-full">
      <Link href={item.href} aria-label={item.ariaLabel} title={item.label}>
        <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border-subtle/80 bg-bg-card text-sm">
          {item.avatarUrl ? (
            <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{item.fallbackIcon}</span>
          )}
        </span>
      </Link>
    </Button>
  );
}

async function loadWorkspaceLinks(userId: string): Promise<{
  master: WorkspaceLink | null;
  studio: WorkspaceLink | null;
}> {
  const [masterProfile, ownedStudio, adminMembership] = await Promise.all([
    prisma.masterProfile.findUnique({
      where: { userId },
      select: { provider: { select: { avatarUrl: true } } },
    }),
    prisma.studio.findFirst({
      where: {
        OR: [{ ownerUserId: userId }, { provider: { ownerUserId: userId } }],
      },
      select: { provider: { select: { avatarUrl: true } } },
    }),
    prisma.studioMembership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN] },
      },
      select: {
        studio: {
          select: { provider: { select: { avatarUrl: true } } },
        },
      },
    }),
  ]);

  const studioProvider = ownedStudio?.provider ?? adminMembership?.studio.provider ?? null;

  return {
    master: masterProfile
      ? {
          href: MASTER_CABINET_PATH,
          label: UI_TEXT.nav.masterWorkspace,
          ariaLabel: UI_TEXT.nav.openMasterWorkspace,
          avatarUrl: masterProfile.provider.avatarUrl ?? null,
          fallbackIcon: "✂️",
        }
      : null,
    studio: studioProvider
      ? {
          href: STUDIO_CABINET_PATH,
          label: UI_TEXT.nav.studioWorkspace,
          ariaLabel: UI_TEXT.nav.openStudioWorkspace,
          avatarUrl: studioProvider.avatarUrl ?? null,
          fallbackIcon: "🏢",
        }
      : null,
  };
}

export async function Topbar() {
  const user = await getSessionUser();
  const siteLogoUrl = await getSiteLogoUrl();

  let notificationsCount = 0;
  let userLabel: string = UI_TEXT.auth.menu;
  let showAdminLink = false;
  let workspaceLinks: { master: WorkspaceLink | null; studio: WorkspaceLink | null } = {
    master: null,
    studio: null,
  };

  if (user) {
    const userPhone = user.phone ? normalizeRussianPhone(user.phone) : null;
    const [invitesCount, unreadNotificationsCount, links] = await Promise.all([
      userPhone
        ? prisma.studioInvite.count({
            where: { phone: userPhone, status: MembershipStatus.PENDING },
          })
        : Promise.resolve(0),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      loadWorkspaceLinks(user.id),
    ]);

    notificationsCount = invitesCount + unreadNotificationsCount;
    userLabel = user.displayName?.trim() || user.phone || UI_TEXT.auth.menu;
    showAdminLink = hasAdminRole(user);
    workspaceLinks = links;
  }

  return (
    <header className="sticky top-0 z-30">
      <div className="mx-auto mt-3 flex h-[var(--topbar-h)] max-w-6xl items-center justify-between rounded-[26px] border border-border-subtle/80 bg-bg-card/75 px-4 shadow-card backdrop-blur">
        <Link href="/" className="flex items-center gap-3">
          {siteLogoUrl ? (
            <img src={siteLogoUrl} alt={UI_TEXT.nav.siteLogoAlt} className="h-10 w-10 rounded-2xl object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-2xl bg-primary/35" />
          )}
          <div className="leading-tight">
            <div className="text-sm font-semibold text-text-main">BeautyHub</div>
            <div className="text-xs text-text-sec">{UI_TEXT.nav.bookingToMasters}</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/catalog">{UI_TEXT.nav.catalog}</Link>
          </Button>

          {user ? (
            <>
              <Button asChild variant="secondary" className="relative">
                <Link href="/notifications" aria-label={UI_TEXT.nav.notifications}>
                  <span aria-hidden>🔔</span>
                  {notificationsCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {notificationsCount > 9 ? "9+" : notificationsCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <ThemeToggle />

              <div className="hidden items-center gap-2 md:flex">
                {workspaceLinks.master ? <WorkspaceShortcutLink item={workspaceLinks.master} /> : null}
                {workspaceLinks.studio ? <WorkspaceShortcutLink item={workspaceLinks.studio} /> : null}
                <AuthUserMenu userLabel={userLabel} showAdminLink={showAdminLink} />
              </div>

              <AuthMobileMenu
                userLabel={userLabel}
                showAdminLink={showAdminLink}
                masterWorkspace={workspaceLinks.master}
                studioWorkspace={workspaceLinks.studio}
              />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Button asChild>
                <Link href="/login">{UI_TEXT.auth.login}</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

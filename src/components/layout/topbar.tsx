/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { MembershipStatus, StudioRole } from "@prisma/client";
import { AuthMobileMenu } from "@/components/layout/auth-mobile-menu";
import { AuthUserMenu } from "@/components/layout/auth-user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { MASTER_CABINET_PATH, STUDIO_CABINET_PATH } from "@/lib/auth/cabinet-paths";
import { hasAdminRole } from "@/lib/auth/guards";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { getSiteLogoUrl } from "@/lib/media/queries";
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
  const [hasMaster, hasStudio] = await Promise.all([
    hasMasterProfile(userId),
    hasStudioAdminAccess(userId),
  ]);

  const [masterProfile, ownedStudio, adminMembership] = await Promise.all([
    hasMaster
      ? prisma.masterProfile.findUnique({
          where: { userId },
          select: { provider: { select: { avatarUrl: true } } },
        })
      : Promise.resolve(null),
    hasStudio
      ? prisma.studio.findFirst({
          where: {
            OR: [{ ownerUserId: userId }, { provider: { ownerUserId: userId } }],
          },
          select: { provider: { select: { avatarUrl: true } } },
        })
      : Promise.resolve(null),
    hasStudio
      ? prisma.studioMembership.findFirst({
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
        })
      : Promise.resolve(null),
  ]);

  const studioProvider = ownedStudio?.provider ?? adminMembership?.studio.provider ?? null;

  return {
    master: hasMaster
      ? {
          href: MASTER_CABINET_PATH,
          label: UI_TEXT.nav.masterWorkspace,
          ariaLabel: UI_TEXT.nav.openMasterWorkspace,
          avatarUrl: masterProfile?.provider.avatarUrl ?? null,
          fallbackIcon: "✂️",
        }
      : null,
    studio: hasStudio
      ? {
          href: STUDIO_CABINET_PATH,
          label: UI_TEXT.nav.studioWorkspace,
          ariaLabel: UI_TEXT.nav.openStudioWorkspace,
          avatarUrl: studioProvider?.avatarUrl ?? null,
          fallbackIcon: "🏢",
        }
      : null,
  };
}

export async function Topbar() {
  const user = await getSessionUser();
  const siteLogoUrl = await getSiteLogoUrl();

  let userLabel: string = UI_TEXT.auth.menu;
  let showAdminLink = false;
  let workspaceLinks: { master: WorkspaceLink | null; studio: WorkspaceLink | null } = {
    master: null,
    studio: null,
  };

  if (user) {
    const links = await loadWorkspaceLinks(user.id);
    userLabel = user.displayName?.trim() || user.phone || UI_TEXT.auth.menu;
    showAdminLink = hasAdminRole(user);
    workspaceLinks = links;
  }

  return (
    <header className="sticky top-0 z-30">
      <div className="mx-auto mt-3 flex h-[var(--topbar-h)] w-full max-w-6xl min-w-0 items-center justify-between rounded-[26px] border border-border-subtle/80 bg-bg-card/75 px-4 shadow-card backdrop-blur">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {siteLogoUrl ? (
            <img src={siteLogoUrl} alt={UI_TEXT.nav.siteLogoAlt} className="h-10 w-10 rounded-2xl object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-2xl bg-primary/35" />
          )}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-text-main">BeautyHub</div>
            <div className="hidden xs:block truncate text-xs text-text-sec">{UI_TEXT.nav.bookingToMasters}</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2 flex-shrink-0">
          <Button asChild variant="secondary" className="hidden sm:inline-flex">
            <Link href="/catalog">{UI_TEXT.nav.catalog}</Link>
          </Button>
          <Button asChild variant="secondary" className="hidden sm:inline-flex">
            <Link href="/models">Для моделей</Link>
          </Button>
          <Button asChild variant="secondary" className="hidden sm:inline-flex">
            <Link href="/cabinet/bookings">{UI_TEXT.nav.myBookings}</Link>
          </Button>

          {user ? (
            <>
              <NotificationsBell ariaLabel={UI_TEXT.nav.notifications} />
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

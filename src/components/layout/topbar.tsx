import Link from "next/link";
import { MembershipStatus, StudioRole } from "@prisma/client";
import { Scissors, Building2 } from "lucide-react";
import { AuthMobileMenu } from "@/components/layout/auth-mobile-menu";
import { AuthUserMenu } from "@/components/layout/auth-user-menu";
import { NavLink } from "@/components/layout/nav-link";
import { TopbarShell } from "@/components/layout/topbar-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { MASTER_CABINET_PATH, STUDIO_CABINET_PATH } from "@/lib/auth/cabinet-paths";
import { hasAdminRole } from "@/lib/auth/guards";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { getSiteLogoAsset } from "@/lib/media/queries";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";
import { FocalImage } from "@/components/ui/focal-image";
import { TopbarAuthButton } from "@/components/layout/topbar-auth-button";

type WorkspaceLink = {
  href: string;
  label: string;
  ariaLabel: string;
  avatarUrl: string | null;
  fallbackIcon: string;
};

function WorkspaceShortcutLink({ item, isStudio }: { item: WorkspaceLink; isStudio?: boolean }) {
  return (
    <Button asChild variant="secondary" size="icon" className="h-10 w-10 rounded-full p-0">
      <Link href={item.href} aria-label={item.ariaLabel} title={item.label}>
        <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border-subtle/80 bg-bg-card text-text-sec">
          {item.avatarUrl ? (
            <FocalImage
              src={item.avatarUrl}
              alt=""
              width={32}
              height={32}
              className="rounded-full object-cover"
            />
          ) : isStudio ? (
            <Building2 className="h-4 w-4" aria-hidden />
          ) : (
            <Scissors className="h-4 w-4" aria-hidden />
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
          fallbackIcon: UI_TEXT.nav.masterWorkspaceFallback,
        }
      : null,
    studio: hasStudio
      ? {
          href: STUDIO_CABINET_PATH,
          label: UI_TEXT.nav.studioWorkspace,
          ariaLabel: UI_TEXT.nav.openStudioWorkspace,
          avatarUrl: studioProvider?.avatarUrl ?? null,
          fallbackIcon: UI_TEXT.nav.studioWorkspaceFallback,
        }
      : null,
  };
}

// Single source of truth for the desktop top-bar menu.
// "Горящие окошки" intentionally removed from the menu — see 07-NAVBAR-FOOTER.
// Page /hot and the /api/hot-slots API stay live; only the menu entry is hidden.
//
// Mobile drawer (auth-mobile-menu.tsx) has its OWN list because it surfaces
// /pricing too — kept separate intentionally. If they ever match, consolidate.
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/catalog", label: UI_TEXT.nav.catalog },
  { href: "/models", label: UI_TEXT.nav.forModels },
  { href: "/cabinet/bookings", label: UI_TEXT.nav.myBookings },
];

export async function Topbar() {
  const user = await getSessionUser();
  const siteLogo = await getSiteLogoAsset();

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
    <TopbarShell>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 lg:h-16 lg:px-6">
        {/* Logo */}
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5">
          {siteLogo?.url ? (
            <FocalImage
              src={siteLogo.url}
              alt={UI_TEXT.nav.siteLogoAlt}
              width={36}
              height={36}
              className="rounded-xl object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient"
            >
              <span className="font-display text-lg font-semibold italic leading-none text-white">
                М
              </span>
            </span>
          )}
          <span className="hidden truncate font-display text-base font-medium text-text-main sm:inline">
            Мастер<em className="not-italic font-display italic text-primary">Рядом</em>
          </span>
        </Link>

        {/* Center nav (desktop) */}
        <nav
          className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex"
          aria-label="Основная навигация"
        >
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href} label={link.label} />
          ))}
        </nav>

        {/* Right side */}
        <nav className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <NotificationsBell ariaLabel={UI_TEXT.nav.notifications} />
              <ThemeToggle />
              <div className="hidden items-center gap-2 md:flex">
                {workspaceLinks.master ? (
                  <WorkspaceShortcutLink item={workspaceLinks.master} />
                ) : null}
                {workspaceLinks.studio ? (
                  <WorkspaceShortcutLink item={workspaceLinks.studio} isStudio />
                ) : null}
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
              <TopbarAuthButton />
              <AuthMobileMenu
                userLabel={UI_TEXT.auth.menu}
                showAdminLink={false}
                masterWorkspace={null}
                studioWorkspace={null}
                isGuest
              />
            </>
          )}
        </nav>
      </div>
    </TopbarShell>
  );
}

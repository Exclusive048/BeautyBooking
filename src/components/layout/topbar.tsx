import Link from "next/link";
import { MembershipStatus, StudioRole } from "@prisma/client";
import { Scissors, Building2 } from "lucide-react";
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

const NAV_LINKS = [
  { href: "/catalog", label: UI_TEXT.nav.catalog },
  { href: "/hot", label: UI_TEXT.nav.hotSlots },
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
    <header className="sticky top-0 z-30">
      <div className="mx-auto mt-3 flex h-[var(--topbar-h)] w-full max-w-6xl min-w-0 items-center justify-between rounded-[26px] border border-border-subtle/80 bg-bg-card/80 px-4 shadow-card backdrop-blur-md">
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
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500" />
          )}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold bg-gradient-to-r from-violet-600 to-pink-500 bg-clip-text text-transparent">
              {UI_TEXT.brand.name}
            </div>
            <div className="hidden xs:block truncate text-xs text-text-sec">{UI_TEXT.nav.bookingToMasters}</div>
          </div>
        </Link>

        {/* Center nav (desktop) */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Основная навигация">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-1.5 text-sm text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <nav className="flex items-center gap-2 shrink-0">
          {/* Compact nav for medium screens */}
          <div className="hidden sm:flex lg:hidden items-center gap-1.5">
            <Button asChild variant="secondary" size="sm">
              <Link href="/catalog">{UI_TEXT.nav.catalog}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="hidden md:inline-flex">
              <Link href="/catalog?hot=true">{UI_TEXT.nav.hotSlots}</Link>
            </Button>
          </div>

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
    </header>
  );
}

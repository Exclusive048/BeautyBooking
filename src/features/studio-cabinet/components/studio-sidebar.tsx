"use client";

import { usePathname } from "next/navigation";
import { CircleHelp, ExternalLink, QrCode } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { NavGroup } from "@/features/master/components/nav-group";
import { StudioUserChip } from "@/features/studio-cabinet/components/studio-user-chip";
import {
  STUDIO_NAV,
  isStudioNavItemActive,
  type StudioNavBadgeKey,
  type StudioNavItem,
} from "@/features/studio-cabinet/config/studio-nav";
import type { StudioSidebarCounts } from "@/features/studio-cabinet/server/sidebar-counts.service";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  counts: StudioSidebarCounts;
  user: {
    name: string;
    avatarUrl: string | null;
  };
  studio: {
    name: string;
    publicHref: string | null;
  };
};

const T = UI_TEXT.studioCabinet;
const MY_PAGE_HREF = "/cabinet/studio/settings/public";
const HELP_HREF = "/help?tab=studio";

function badgeValue(
  counts: StudioSidebarCounts,
  badgeKey: StudioNavBadgeKey | undefined,
): number | undefined {
  if (!badgeKey) return undefined;
  return counts[badgeKey];
}

/**
 * Desktop sidebar shell for /cabinet/studio/*. Brand block at the top,
 * STUDIO_NAV groups in the middle, and a `StudioUserChip` with role
 * switcher pinned to the bottom. Reuses the master-cabinet
 * `<SidebarItem>` + `<NavGroup>` primitives so both cabinets share
 * pixel-level visual parity.
 */
export function StudioSidebar({ counts, user, studio }: Props) {
  const pathname = usePathname();

  const myPageActive = pathname === MY_PAGE_HREF;

  const renderItem = (item: StudioNavItem) => {
    // «Моя страница» лежит под `/settings`: без исключения горели бы оба пункта.
    const active = !myPageActive && isStudioNavItemActive(pathname, item);
    const label = T.nav.items[item.labelKey];
    const badge = badgeValue(counts, item.badgeKey);
    return (
      <li key={item.id}>
        <SidebarItem
          href={item.href}
          label={label}
          icon={item.icon}
          active={active}
          badge={badge}
          badgeAriaLabel={badge ? `${label}: ${badge}` : undefined}
        />
      </li>
    );
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col" aria-label={T.nav.ariaLabel}>
      <div className="border-b border-border-subtle px-5 py-5">
        <BrandLogo variant="full" size="sm" href="/cabinet/studio" />
        <p className="mt-1.5 eyebrow">
          {T.appCaption}
        </p>
      </div>

      <nav aria-label={UI_TEXT.a11y.cabinetSections} className="px-3 py-4">
        {STUDIO_NAV.map((group, groupIndex) => (
          <NavGroup
            key={group.id}
            label={T.nav.groups[group.labelKey]}
            first={groupIndex === 0}
          >
            {group.items.map((item) => renderItem(item))}
          </NavGroup>
        ))}

        <NavGroup label={T.nav.groups.studioMetaExternal}>
          {studio.publicHref ? (
            <li>
              <Link
                href={studio.publicHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main"
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{T.nav.items.publicPageExternal}</span>
              </Link>
            </li>
          ) : null}
          {/* «Моя страница» — ссылка, QR-код и визитка страницы студии, как
              «Моя страница →» в листе «Ещё»; «Помощь» — инструкция по кабинету. */}
          <li>
            <SidebarItem
              href={MY_PAGE_HREF}
              label={T.nav.items.myPage}
              icon={QrCode}
              active={myPageActive}
            />
          </li>
          <li>
            <SidebarItem href={HELP_HREF} label={T.nav.items.help} icon={CircleHelp} />
          </li>
        </NavGroup>
      </nav>

      <div className="mt-8">
        <StudioUserChip
          name={user.name}
          avatarUrl={user.avatarUrl}
          studioName={studio.name}
        />
      </div>
    </aside>
  );
}

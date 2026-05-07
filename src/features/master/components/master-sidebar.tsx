"use client";

import { usePathname } from "next/navigation";
import {
  Bell,
  Calendar,
  CalendarDays,
  Cog,
  ExternalLink,
  Home,
  LineChart,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LockBadge } from "@/components/billing/PaywallCard";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { MasterUserChip } from "@/features/master/components/master-user-chip";
import { NavGroup } from "@/features/master/components/nav-group";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { UI_TEXT } from "@/lib/ui/text";

type Counts = {
  pendingBookings: number;
  unreadNotifications: number;
  unansweredReviews: number;
};

type Props = {
  counts: Counts;
  user: {
    name: string;
    avatarUrl: string | null;
  };
  trial: {
    isTrial: boolean;
    daysLeft: number;
  };
  planTier: "FREE" | "PRO" | "PREMIUM";
  publicUsername: string | null;
};

const T = UI_TEXT.cabinetMaster;

const HREF = {
  home: "/cabinet/master/dashboard",
  bookings: "/cabinet/master/bookings",
  notifications: "/cabinet/master/notifications",
  schedule: "/cabinet/master/schedule",
  scheduleSettings: "/cabinet/master/schedule/settings",
  clients: "/cabinet/master/clients",
  reviews: "/cabinet/master/reviews",
  analytics: "/cabinet/master/analytics",
  modelOffers: "/cabinet/master/model-offers",
  profile: "/cabinet/master/profile",
  settings: "/cabinet/master/settings",
} as const;

function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
  badgeAriaLabel?: string;
  target?: "_blank";
  /** Optional billing feature that gates this entry — falls back to lock badge when missing. */
  featureKey?: "analytics_dashboard";
};

/**
 * Desktop sidebar shell for /cabinet/master/*. Brand block at the top, four
 * groups of nav items in the middle, user-chip pinned to the bottom. Counts
 * (pending bookings, unread notifs, unanswered reviews) are server-resolved
 * in the layout and passed through; the chip's status mirrors the trial /
 * plan state from the same fetch.
 */
export function MasterSidebar({
  counts,
  user,
  trial,
  planTier,
  publicUsername,
}: Props) {
  const pathname = usePathname();
  const plan = usePlanFeatures("MASTER");

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item.href, item.exact);
    const locked = item.featureKey
      ? !plan.can(item.featureKey) && !plan.loading
      : false;

    return (
      <li key={item.href} className="relative">
        <SidebarItem
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={active}
          badge={item.badge}
          badgeAriaLabel={item.badgeAriaLabel}
          target={item.target}
        />
        {locked ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <LockBadge tooltip={UI_TEXT.master.sidebar.lockedHint} />
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col"
      aria-label={T.nav.ariaLabel}
    >
      {/* Brand block — square monogram + display title + mono subtitle. */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-5">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient font-display text-base font-semibold text-white shadow-sm"
        >
          М
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-text-main">
            {T.brand.title}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.brand.subtitle}
          </p>
        </div>
      </div>

      <nav className="px-3 py-4">
        <NavGroup label={T.nav.groups.work} first>
          {renderItem({
            href: HREF.home,
            label: T.nav.items.home,
            icon: Home,
            exact: true,
          })}
          {renderItem({
            href: HREF.bookings,
            label: T.nav.items.bookings,
            icon: Calendar,
            badge: counts.pendingBookings,
          })}
          {renderItem({
            href: HREF.notifications,
            label: T.nav.items.notifications,
            icon: Bell,
            badge: counts.unreadNotifications,
          })}
          {renderItem({
            href: HREF.schedule,
            label: T.nav.items.schedule,
            icon: CalendarDays,
          })}
          {renderItem({
            href: HREF.scheduleSettings,
            label: T.nav.items.scheduleSettings,
            icon: SlidersHorizontal,
          })}
        </NavGroup>

        <NavGroup label={T.nav.groups.clients}>
          {renderItem({
            href: HREF.clients,
            label: T.nav.items.clients,
            icon: Users,
          })}
          {renderItem({
            href: HREF.reviews,
            label: T.nav.items.reviews,
            icon: Star,
            badge: counts.unansweredReviews,
          })}
          {renderItem({
            href: HREF.modelOffers,
            label: UI_TEXT.master.topbar.nav.models,
            icon: Sparkles,
          })}
        </NavGroup>

        <NavGroup label={T.nav.groups.business}>
          {renderItem({
            href: HREF.analytics,
            label: T.nav.items.analytics,
            icon: LineChart,
            featureKey: "analytics_dashboard",
          })}
        </NavGroup>

        <NavGroup label={T.nav.groups.account}>
          {renderItem({
            href: HREF.profile,
            label: T.nav.items.profile,
            icon: UserCircle,
          })}
          {renderItem({
            href: HREF.settings,
            label: T.nav.items.accountSettings,
            icon: Cog,
          })}
          {publicUsername
            ? renderItem({
                href: `/u/${publicUsername}`,
                label: T.nav.items.publicPage,
                icon: ExternalLink,
                target: "_blank",
              })
            : null}
        </NavGroup>
      </nav>

      {/* Chip flows after the last nav group with a comfortable margin —
          intentionally NOT pinned to viewport bottom (no `mt-auto`). On a
          short sidebar empty space falls below the chip; if more groups
          are added later the chip scrolls along with the rest. */}
      <div className="mt-8">
        <MasterUserChip
          name={user.name}
          avatarUrl={user.avatarUrl}
          isTrial={trial.isTrial}
          trialDaysLeft={trial.daysLeft}
          planTier={planTier}
        />
      </div>
    </aside>
  );
}

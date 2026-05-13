"use client";

import { usePathname } from "next/navigation";
import {
  Calendar,
  Send,
  Heart,
  Star,
  User,
  Bell,
  HelpCircle,
} from "lucide-react";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { UI_TEXT } from "@/lib/ui/text";

type GroupItem = {
  href: string;
  label: string;
  icon: typeof Calendar;
  exact?: boolean;
  badgeKey?: "bookings" | "favorites" | "notifications" | "pendingReviews";
};

type Group = {
  label: string;
  items: GroupItem[];
};

const NAV_GROUPS: Group[] = [
  {
    label: UI_TEXT.clientCabinet.nav.groupActivity,
    items: [
      {
        href: "/cabinet/bookings",
        label: UI_TEXT.clientCabinet.nav.bookings,
        icon: Calendar,
        badgeKey: "bookings",
      },
      {
        href: "/cabinet/messages",
        label: UI_TEXT.clientCabinet.nav.messages,
        icon: Send,
      },
      {
        href: "/cabinet/favorites",
        label: UI_TEXT.clientCabinet.nav.favorites,
        icon: Heart,
        badgeKey: "favorites",
      },
      {
        href: "/cabinet/reviews",
        label: UI_TEXT.clientCabinet.nav.reviews,
        icon: Star,
        badgeKey: "pendingReviews",
      },
    ],
  },
  {
    label: UI_TEXT.clientCabinet.nav.groupAccount,
    items: [
      {
        href: "/cabinet/profile",
        label: UI_TEXT.clientCabinet.nav.profile,
        icon: User,
      },
      {
        href: "/cabinet/notifications",
        label: UI_TEXT.clientCabinet.nav.notifications,
        icon: Bell,
        badgeKey: "notifications",
      },
      {
        href: "/cabinet/faq",
        label: UI_TEXT.clientCabinet.nav.faq,
        icon: HelpCircle,
      },
    ],
  },
];

type Props = {
  userLabel?: string | null;
  /** Counts drive sidebar badges. 0 / undefined → no badge. */
  favoritesCount?: number;
  upcomingBookingsCount?: number;
  unreadNotificationsCount?: number;
  pendingReviewsCount?: number;
};

function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function CabinetSidebar({
  userLabel,
  favoritesCount = 0,
  upcomingBookingsCount = 0,
  unreadNotificationsCount = 0,
  pendingReviewsCount = 0,
}: Props) {
  const pathname = usePathname() ?? "/";
  const label = userLabel?.trim() || UI_TEXT.brand.name;

  const badgeFor = (key?: GroupItem["badgeKey"]) => {
    switch (key) {
      case "bookings":
        return upcomingBookingsCount;
      case "favorites":
        return favoritesCount;
      case "notifications":
        return unreadNotificationsCount;
      case "pendingReviews":
        return pendingReviewsCount;
      default:
        return undefined;
    }
  };

  return (
    <aside className="w-full lg:w-[248px] lg:shrink-0">
      <div className="glass-panel rounded-[26px] p-4 lg:sticky lg:top-6">
        <div className="flex flex-col gap-5">
          <div className="space-y-0.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
              {UI_TEXT.clientCabinet.nav.sectionEyebrow}
            </div>
            <div className="truncate text-base font-semibold text-text-main">
              {label}
            </div>
          </div>

          <nav className="space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href, item.exact);
                  return (
                    <SidebarItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={active}
                      icon={item.icon}
                      badge={badgeFor(item.badgeKey)}
                    />
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="border-t border-border-subtle/70 pt-3">
            <LogoutButton
              variant="secondary"
              size="sm"
              className="w-full justify-start"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
